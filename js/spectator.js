// ============================================================================
// Car'Tech Arena — Mode spectateur
// Écran en LECTURE SEULE, accessible à tout compte connecté (joueur ou
// organisateur) : résultats du jour pour le Duel du jour, et l'Événement en
// cours ou tout juste terminé aujourd'hui. Aucune action possible ici (pas
// de proposition de duel, pas d'inscription à un événement...).
//
// Les decks ne sont JAMAIS visibles pendant un combat/événement, seulement
// une fois terminé — ceci est déjà garanti par les règles Firestore
// existantes (un spectateur n'est ni participant ni organisateur, donc son
// compte ne peut lire un deck qu'une fois le duel/événement passé à
// "termine" — voir firestore.rules), aucune dérogation n'est nécessaire ici.
//
// Portée "aujourd'hui" : le Duel du jour n'affiche que les duels terminés
// AUJOURD'HUI ; l'Événement ne s'affiche que s'il est en cours, ou terminé
// aujourd'hui. Dès qu'il n'y a plus rien de "aujourd'hui" à montrer, l'écran
// se vide de lui-même (message "rien à voir pour l'instant").
// ============================================================================
import {
  doc,
  getDoc,
  collection,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import { db } from "./firebase-init.js";
import { $, hideAllViews } from "./app.js";
import { findFormat } from "./catalog.js";
import { getGameElements, elementIconsHtml } from "./live-catalog.js";

const duelsCol = collection(db, "dailySession", "current", "duels");
const eventsCol = collection(db, "events");

// ---------------------------------------------------------------------------
// État local (rempli en direct par les écouteurs onSnapshot)
// ---------------------------------------------------------------------------
let duels = [];
let eventsAll = [];
let spectatedEvent = null; // l'événement en cours, ou tout juste terminé aujourd'hui (voir pickSpectatedEvent)
let eventParticipants = [];
let eventMatches = [];
let listening = false;
let unsubDuels = null;
let unsubEvents = null;
let unsubParticipants = null;
let unsubMatches = null;

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------
function toDate(v) {
  if (!v) return new Date();
  if (typeof v.toDate === "function") return v.toDate();
  return new Date(v);
}
function localDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function isToday(v) {
  return v ? localDateStr(toDate(v)) === localDateStr() : false;
}
function ordinal(n) {
  return n === 1 ? "1ère" : `${n}ème`;
}
function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

// L'événement "en cours" prime toujours ; sinon, le dernier événement
// terminé AUJOURD'HUI seulement (jamais un événement d'un autre jour — voir
// le long commentaire en haut du fichier).
function pickSpectatedEvent() {
  const running = eventsAll.find((e) => e.status === "en_cours");
  if (running) return running;
  const finishedToday = eventsAll
    .filter((e) => e.status === "termine" && isToday(e.finishedAt))
    .sort((a, b) => toDate(b.finishedAt) - toDate(a.finishedAt))[0];
  return finishedToday || null;
}

// ---------------------------------------------------------------------------
// Écoutes temps réel
// ---------------------------------------------------------------------------
function attachEventSubListeners() {
  if (unsubParticipants) unsubParticipants();
  if (unsubMatches) unsubMatches();
  eventParticipants = [];
  eventMatches = [];
  if (!spectatedEvent) {
    render();
    return;
  }
  unsubParticipants = onSnapshot(collection(db, "events", spectatedEvent.id, "participants"), (snap) => {
    eventParticipants = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  });
  unsubMatches = onSnapshot(collection(db, "events", spectatedEvent.id, "matches"), (snap) => {
    eventMatches = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  });
}

function startListening() {
  if (listening) return;
  listening = true;
  unsubDuels = onSnapshot(duelsCol, (snap) => {
    duels = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  });
  unsubEvents = onSnapshot(eventsCol, (snap) => {
    eventsAll = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const next = pickSpectatedEvent();
    const changed = (next && next.id) !== (spectatedEvent && spectatedEvent.id);
    spectatedEvent = next;
    if (changed) attachEventSubListeners();
    render();
  });
}
function stopListening() {
  unsubDuels?.();
  unsubEvents?.();
  unsubParticipants?.();
  unsubMatches?.();
  unsubDuels = unsubEvents = unsubParticipants = unsubMatches = null;
  listening = false;
  duels = [];
  eventsAll = [];
  spectatedEvent = null;
  eventParticipants = [];
  eventMatches = [];
}

// ---------------------------------------------------------------------------
// Rendu — Duel du jour (résultats d'aujourd'hui uniquement)
// ---------------------------------------------------------------------------
function todaysFinishedDuels() {
  return duels
    .filter((d) => d.status === "termine" && isToday(d.resolvedAt || d.createdAt))
    .sort((a, b) => toDate(b.resolvedAt || b.createdAt) - toDate(a.resolvedAt || a.createdAt));
}

// Déjà lisible pour un compte spectateur puisque le duel est "termine" (voir
// firestore.rules) — vide si le jeu n'a aucun élément configuré, comme
// partout ailleurs dans l'appli (elementIconsHtml gère ce cas).
async function deckHtmlFor(duelId, uid, game) {
  if (!getGameElements(game).length) return "";
  try {
    const snap = await getDoc(doc(db, "dailySession", "current", "duels", duelId, "decks", uid));
    return elementIconsHtml(game, snap.exists() ? snap.data().elements : null);
  } catch {
    return "";
  }
}

async function renderDuelsSection() {
  const el = $("#spec-duels");
  if (!el) return;
  const todays = todaysFinishedDuels();
  if (!todays.length) {
    el.innerHTML = "";
    el.style.display = "none";
    render_updateEmptyNote();
    return;
  }
  el.style.display = "";
  const rows = await Promise.all(
    todays.map(async (d) => {
      const won1 = d.resultFrom?.iWon;
      const scoreLine = d.resultFrom ? ` (${d.resultFrom.myScore} - ${d.resultFrom.oppScore})` : "";
      const [deck1, deck2] = await Promise.all([
        deckHtmlFor(d.id, d.fromUid, d.game),
        deckHtmlFor(d.id, d.toUid, d.game),
      ]);
      const decksLine =
        deck1 || deck2
          ? `<div class="settings-note">${escapeHtml(d.fromPseudo)} : ${deck1 || "—"} &nbsp;·&nbsp; ${escapeHtml(d.toPseudo)} : ${deck2 || "—"}</div>`
          : "";
      return `
        <div class="dd-row">
          <div class="dd-row-name">
            ${won1 ? "🏆 " : ""}${escapeHtml(d.fromPseudo)}${scoreLine} 🆚 ${!won1 && d.resultFrom ? "🏆 " : ""}${escapeHtml(d.toPseudo)}
            <span class="dd-pill">${escapeHtml(d.game)}</span>
            ${decksLine}
          </div>
        </div>`;
    })
  );
  el.innerHTML = `<h3>⚔️ Duel du jour — résultats d'aujourd'hui</h3>` + rows.join("");
  render_updateEmptyNote();
}

// ---------------------------------------------------------------------------
// Rendu — Événement (en cours, ou terminé aujourd'hui)
// ---------------------------------------------------------------------------
function eventMatchStatusLabel(m) {
  if (m.isBye) return "🎁 bye (victoire auto)";
  if (m.status === "litige") return "⚠️ litige";
  if (m.status !== "termine") return "🟡 en cours";
  const wins1 = (m.gamesResult1 || []).filter((g) => g.iWon).length;
  const wins2 = (m.gamesResult1 || []).length - wins1;
  const winnerPseudo = wins1 > wins2 ? m.player1Pseudo : m.player2Pseudo;
  return `✅ ${escapeHtml(winnerPseudo)} gagne`;
}

async function renderEventSection() {
  const el = $("#spec-event");
  if (!el) return;
  if (!spectatedEvent) {
    el.innerHTML = "";
    el.style.display = "none";
    render_updateEmptyNote();
    return;
  }
  el.style.display = "";
  let html = `<h3>🏆 Événement</h3><p class="settings-note">${escapeHtml(spectatedEvent.game)} — ${findFormat(spectatedEvent.formatId).label}</p>`;

  if (spectatedEvent.status === "en_cours") {
    html += `<p class="settings-note">Manche ${spectatedEvent.currentRound} — les decks ne sont révélés qu'une fois l'événement terminé.</p>`;
    const matches = eventMatches.filter((m) => m.round === spectatedEvent.currentRound);
    if (!matches.length) {
      html += `<p class="settings-note">Appariements pas encore lancés.</p>`;
    }
    matches.forEach((m) => {
      html += `<div class="dd-row"><div class="dd-row-name">${escapeHtml(m.player1Pseudo)}${m.isBye ? "" : ` 🆚 ${escapeHtml(m.player2Pseudo)}`} <span class="dd-pill">${eventMatchStatusLabel(m)}</span></div></div>`;
    });
    el.innerHTML = html;
    render_updateEmptyNote();
    return;
  }

  // "termine" (aujourd'hui, garanti par pickSpectatedEvent) : classement
  // final avec decks (lisibles maintenant, voir firestore.rules).
  const gameElements = getGameElements(spectatedEvent.game);
  const ranked = eventParticipants.filter((p) => p.placement != null).sort((a, b) => a.placement - b.placement);
  let decksByUid = {};
  if (gameElements.length && ranked.length) {
    const snaps = await Promise.all(
      ranked.map((p) =>
        getDoc(doc(db, "events", spectatedEvent.id, "participants", p.id, "deck", "info")).catch(() => null)
      )
    );
    ranked.forEach((p, i) => {
      decksByUid[p.id] = snaps[i] && snaps[i].exists() ? snaps[i].data().elements : null;
    });
  }
  html += `<div class="manage-grid-label">🏆 Classement final</div>`;
  if (!ranked.length) {
    html += `<p class="settings-note">Classement en cours de calcul…</p>`;
  }
  ranked.forEach((p) => {
    html += `<div class="dd-row"><div class="dd-row-name">${ordinal(p.placement)} — ${escapeHtml(p.pseudo)}${
      gameElements.length ? `<br><span class="settings-note">${elementIconsHtml(spectatedEvent.game, decksByUid[p.id])}</span>` : ""
    }</div></div>`;
  });
  el.innerHTML = html;
  render_updateEmptyNote();
}

// ---------------------------------------------------------------------------
// Message "rien à afficher" — visible seulement si AUCUNE des deux sections
// n'a quelque chose à montrer (voir le long commentaire en haut du fichier).
// ---------------------------------------------------------------------------
function render_updateEmptyNote() {
  const nothing = $("#spec-nothing");
  if (!nothing) return;
  const hasDuels = todaysFinishedDuels().length > 0;
  nothing.style.display = !hasDuels && !spectatedEvent ? "" : "none";
}

function render() {
  renderDuelsSection();
  renderEventSection();
  render_updateEmptyNote();
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------
export function showSpectatorScreen() {
  hideAllViews();
  $("#view-spectator")?.classList.add("active");
  startListening();
  render();
}
function closeSpectatorScreen() {
  hideAllViews();
  $("#view-app")?.classList.add("active");
  stopListening();
}

document.addEventListener("DOMContentLoaded", () => {
  $("#btn-open-spectator")?.addEventListener("click", showSpectatorScreen);
  $("#btn-close-spectator")?.addEventListener("click", closeSpectatorScreen);
});
