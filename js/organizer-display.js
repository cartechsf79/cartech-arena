// ============================================================================
// Car'Tech Arena — Écran d'affichage organisateur
// Écran réservé à l'organisateur (comme le Tableau de bord), pensé pour être
// ouvert sur un second écran/une télé installée en boutique, pour que tout le
// monde puisse suivre en direct sans avoir à sortir son téléphone :
//   - le chronomètre de la manche en cours d'un événement (déjà lancé par
//     l'organisateur uniquement, synchronisé pour tous via roundStartAt —
//     voir event.js) ;
//   - le placement des joueurs pendant l'événement (classement provisoire,
//     victoires/défaites) ;
//   - le score final de l'événement une fois terminé, avec les decks
//     utilisés par chacun ;
//   - le classement des points gagnés aujourd'hui via le Duel du jour
//     (redevient vide dès le lendemain — voir computeTodayDuelPoints).
//
// Volontairement structuré en sections indépendantes (une fonction de rendu
// par section) pour pouvoir en ajouter facilement d'autres par la suite (voir
// le commentaire de render() plus bas) — l'organisateur a mentionné vouloir
// en ajouter au fil du temps.
// ============================================================================
import { doc, getDoc, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import { db } from "./firebase-init.js";
import { $, getCurrentProfile, hideAllViews } from "./app.js";
import { findFormat } from "./catalog.js";
import { getGameElements, elementIconsHtml } from "./live-catalog.js";
import { WIN_POINTS, LOSS_POINTS, MAX_POINTS_PER_DAY, localDateStr, toDate } from "./season.js";

const eventsCol = collection(db, "events");
const duelsCol = collection(db, "dailySession", "current", "duels");

// ---------------------------------------------------------------------------
// État local
// ---------------------------------------------------------------------------
let eventsAll = [];
let activeEvent = null;
let eventParticipants = [];
let eventMatches = [];
let duels = [];
let listening = false;
let unsubEvents = null;
let unsubParticipants = null;
let unsubMatches = null;
let unsubDuels = null;
let countdownInterval = null;

function isOrganizer() {
  return getCurrentProfile()?.role === "organisateur";
}
function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}
function ordinal(n) {
  return n === 1 ? "1ère" : `${n}ème`;
}
function isToday(v) {
  return v ? localDateStr(toDate(v)) === localDateStr() : false;
}
function formatCountdown(roundStartAt, roundMinutes) {
  const deadline = toDate(roundStartAt).getTime() + roundMinutes * 60000;
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) return "⏱️ Temps écoulé";
  const totalSec = Math.floor(remainingMs / 1000);
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  return `⏱️ ${mm}:${String(ss).padStart(2, "0")} restantes`;
}

// Écran de visualisation passive uniquement, comme le mode spectateur (voir
// pickSpectatedEvent dans spectator.js) — PAS la même sélection que event.js
// (son panneau organisateur a besoin de "le prochain programmé" pour la
// gestion des inscriptions, ce qui n'a pas de sens ici). On ne montre donc
// jamais un événement pas encore commencé ("inscription") : c'est le rôle du
// calendrier désormais (voir showCalendarScreen dans event.js). En cours
// d'abord, sinon le dernier terminé (pour laisser voir le score final juste
// après) — jamais le prochain programmé, sinon un tournoi déjà planifié à
// l'avance masquerait le score final du tournoi qui vient de se terminer,
// alors que renderEventLiveSection/renderEventFinalSection n'affichent de
// toute façon jamais rien pour un événement encore "inscription".
function pickActiveEvent() {
  const running = eventsAll.find((e) => e.status === "en_cours");
  if (running) return running;
  return (
    eventsAll
      .filter((e) => e.status === "termine")
      .sort((a, b) => toDate(b.finishedAt || b.createdAt) - toDate(a.finishedAt || a.createdAt))[0] || null
  );
}

// Même logique que matchWinnerUid dans event.js : une fois "termine",
// gamesResult1 seul suffit (les 2 tableaux concordent par construction).
function matchWinnerUid(m) {
  if (m.status !== "termine") return null;
  if (m.isBye) return m.player1Uid;
  const wins1 = (m.gamesResult1 || []).filter((g) => g.iWon).length;
  const wins2 = (m.gamesResult1 || []).length - wins1;
  return wins1 > wins2 ? m.player1Uid : m.player2Uid;
}
function computeRecord(uid) {
  let wins = 0,
    losses = 0;
  eventMatches.forEach((m) => {
    if (m.status !== "termine") return;
    if (m.player1Uid !== uid && m.player2Uid !== uid) return;
    if (matchWinnerUid(m) === uid) wins++;
    else losses++;
  });
  return { wins, losses };
}

// ---------------------------------------------------------------------------
// Écoutes temps réel — seulement pendant que l'écran est ouvert.
// ---------------------------------------------------------------------------
function attachEventSubListeners() {
  if (unsubParticipants) unsubParticipants();
  if (unsubMatches) unsubMatches();
  eventParticipants = [];
  eventMatches = [];
  if (!activeEvent) {
    render();
    return;
  }
  unsubParticipants = onSnapshot(collection(db, "events", activeEvent.id, "participants"), (snap) => {
    eventParticipants = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  });
  unsubMatches = onSnapshot(collection(db, "events", activeEvent.id, "matches"), (snap) => {
    eventMatches = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  });
}

function startListening() {
  if (listening) return;
  listening = true;
  unsubEvents = onSnapshot(eventsCol, (snap) => {
    eventsAll = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const next = pickActiveEvent();
    const changed = (next && next.id) !== (activeEvent && activeEvent.id);
    activeEvent = next;
    if (changed) attachEventSubListeners();
    render();
  });
  unsubDuels = onSnapshot(duelsCol, (snap) => {
    duels = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  });
}
function stopListening() {
  unsubEvents?.();
  unsubParticipants?.();
  unsubMatches?.();
  unsubDuels?.();
  unsubEvents = unsubParticipants = unsubMatches = unsubDuels = null;
  listening = false;
  eventsAll = [];
  activeEvent = null;
  eventParticipants = [];
  eventMatches = [];
  duels = [];
}
function startCountdownTicker() {
  if (countdownInterval) return;
  countdownInterval = setInterval(() => {
    const el = document.getElementById("orgdisp-countdown");
    if (el && activeEvent?.roundStartAt) {
      el.textContent = formatCountdown(activeEvent.roundStartAt, activeEvent.roundMinutes);
    }
  }, 1000);
}
function stopCountdownTicker() {
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = null;
}

// ---------------------------------------------------------------------------
// Rendu — Chronomètre + placements de l'événement en cours
// ---------------------------------------------------------------------------
function renderEventLiveSection() {
  const el = $("#orgdisp-event-live");
  if (!el) return;
  if (!activeEvent || activeEvent.status !== "en_cours") {
    el.innerHTML = "";
    el.style.display = "none";
    return;
  }
  el.style.display = "";

  let html = `<h3>🏆 ${escapeHtml(activeEvent.game)} — ${findFormat(activeEvent.formatId).label}</h3>`;
  html += `<p class="settings-note">Manche ${activeEvent.currentRound}</p>`;
  html += activeEvent.roundStartAt
    ? `<p id="orgdisp-countdown">${formatCountdown(activeEvent.roundStartAt, activeEvent.roundMinutes)}</p>`
    : `<p class="settings-note">⏳ En attente du lancement du chronomètre par l'organisateur…</p>`;

  const registered = eventParticipants.filter((p) => p.status === "inscrit");
  const ranked = registered.map((p) => ({ ...p, ...computeRecord(p.id) })).sort((a, b) => b.wins - a.wins || a.losses - b.losses);
  html += `<div class="manage-grid-label">📍 Placement provisoire</div>`;
  ranked.forEach((p, idx) => {
    html += `<div class="dd-row"><div class="dd-row-name">#${idx + 1} — ${escapeHtml(p.pseudo)} <span class="dd-pill">${p.wins}V / ${p.losses}D</span></div></div>`;
  });

  el.innerHTML = html;
}

// ---------------------------------------------------------------------------
// Rendu — Score final + decks utilisés (une fois l'événement terminé)
// ---------------------------------------------------------------------------
async function renderEventFinalSection() {
  const el = $("#orgdisp-event-final");
  if (!el) return;
  if (!activeEvent || activeEvent.status !== "termine") {
    el.innerHTML = "";
    el.style.display = "none";
    return;
  }
  el.style.display = "";

  const gameElements = getGameElements(activeEvent.game);
  const ranked = eventParticipants.filter((p) => p.placement != null).sort((a, b) => a.placement - b.placement);
  let decksByUid = {};
  if (gameElements.length && ranked.length) {
    const snaps = await Promise.all(
      ranked.map((p) => getDoc(doc(db, "events", activeEvent.id, "participants", p.id, "deck", "info")).catch(() => null))
    );
    ranked.forEach((p, i) => {
      decksByUid[p.id] = snaps[i] && snaps[i].exists() ? snaps[i].data().elements : null;
    });
  }

  let html = `<h3>🏆 Score final — ${escapeHtml(activeEvent.game)}</h3>`;
  if (!ranked.length) {
    html += `<p class="settings-note">Classement en cours de calcul…</p>`;
  }
  ranked.forEach((p) => {
    html += `<div class="dd-row"><div class="dd-row-name">${ordinal(p.placement)} — ${escapeHtml(p.pseudo)}${
      gameElements.length ? `<br><span class="settings-note">${elementIconsHtml(activeEvent.game, decksByUid[p.id])}</span>` : ""
    }</div></div>`;
  });
  el.innerHTML = html;
}

// ---------------------------------------------------------------------------
// Rendu — Classement des points Duel du jour (aujourd'hui uniquement, mêmes
// règles que la saison — voir season.js — mais sur une seule journée, donc le
// plafond de MAX_POINTS_PER_DAY par jour se résume à un plafond unique sur le
// total du jour).
// ---------------------------------------------------------------------------
function computeTodayDuelPoints() {
  const raw = {}; // uid -> { pseudo, points }
  function bump(uid, pseudo, won) {
    if (!raw[uid]) raw[uid] = { pseudo, points: 0 };
    raw[uid].points += won ? WIN_POINTS : LOSS_POINTS;
  }
  duels.forEach((d) => {
    if (d.status !== "termine" || !isToday(d.resolvedAt || d.createdAt)) return;
    if (!d.resultFrom || !d.resultTo) return;
    bump(d.fromUid, d.fromPseudo, !!d.resultFrom.iWon);
    bump(d.toUid, d.toPseudo, !!d.resultTo.iWon);
  });
  return Object.entries(raw)
    .map(([uid, v]) => ({ uid, pseudo: v.pseudo, points: Math.min(v.points, MAX_POINTS_PER_DAY) }))
    .sort((a, b) => b.points - a.points || a.pseudo.localeCompare(b.pseudo));
}

function renderTodayLeaderboardSection() {
  const el = $("#orgdisp-today-leaderboard");
  if (!el) return;
  const rows = computeTodayDuelPoints();
  if (!rows.length) {
    el.innerHTML = "";
    el.style.display = "none";
    return;
  }
  el.style.display = "";
  let html = `<h3>🥇 Défi du jour — classement d'aujourd'hui</h3>`;
  rows.forEach((r, idx) => {
    html += `<div class="dd-row"><div class="dd-row-name">#${idx + 1} — ${escapeHtml(r.pseudo)} <span class="dd-pill">${r.points} pts</span></div></div>`;
  });
  el.innerHTML = html;
}

// ---------------------------------------------------------------------------
// Rendu global — pour ajouter une future section : écrire sa fonction de
// rendu (dans son propre <div id="orgdisp-..."> dans index.html) puis
// l'appeler ici, comme les 4 existantes.
// ---------------------------------------------------------------------------
function render() {
  renderEventLiveSection();
  renderEventFinalSection();
  renderTodayLeaderboardSection();
  const nothing = $("#orgdisp-nothing");
  if (nothing) {
    const eventHasContent = !!activeEvent && (activeEvent.status === "en_cours" || activeEvent.status === "termine");
    const leaderboardHasContent = computeTodayDuelPoints().length > 0;
    nothing.style.display = !eventHasContent && !leaderboardHasContent ? "" : "none";
  }
}

// ---------------------------------------------------------------------------
// Navigation — cet écran s'ouvre désormais dans son PROPRE onglet/fenêtre
// de navigateur (pensé pour rester affiché en continu sur un 2e écran/une
// télé en boutique), pas comme un écran de plus dans l'appli : le bouton
// "Écran d'affichage" ouvre un nouvel onglet plutôt que de naviguer sur
// place (voir openDisplayInNewTab), et il n'y a volontairement aucun moyen
// de "quitter" cet écran une fois ouvert — juste les informations, en
// continu (l'utilisateur ferme l'onglet lui-même s'il veut arrêter).
//
// Le nouvel onglet arrive avec ?affichage=1 dans l'URL ; js/app.js détecte
// ce paramètre juste après la connexion et, si le compte est bien
// l'organisateur, déclenche l'évènement "cartech:enter-display-mode"
// ci-dessous au lieu d'afficher l'écran d'accueil normal.
// ---------------------------------------------------------------------------
export function showOrganizerDisplayScreen() {
  if (!isOrganizer()) return;
  hideAllViews();
  $("#view-organizer-display")?.classList.add("active");
  startListening();
  startCountdownTicker();
  render();
}

function buildDisplayUrl() {
  const url = new URL(location.href);
  url.hash = "";
  url.searchParams.set("affichage", "1");
  return url.toString();
}
function openDisplayInNewTab() {
  window.open(buildDisplayUrl(), "_blank");
}

document.addEventListener("DOMContentLoaded", () => {
  $("#btn-open-organizer-display")?.addEventListener("click", openDisplayInNewTab);
});
document.addEventListener("cartech:enter-display-mode", () => {
  showOrganizerDisplayScreen();
});
