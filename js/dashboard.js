// ============================================================================
// Car'Tech Arena — Tableau de bord organisateur
// Indicateurs pour piloter la boutique (pas juste le jeu) : combien de
// joueurs reviennent chaque semaine, quel jeu tourne le plus, qui revient
// régulièrement. Calculés en direct à partir de l'historique du Duel du
// jour (dailySession/current/duels) — même philosophie que le reste de
// l'appli (jamais de compteur stocké/incrémenté à la main), sur une fenêtre
// glissante de 30 jours (pas "cette semaine civile" ni "ce mois civil").
// ============================================================================
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import { db } from "./firebase-init.js";
import { $, getCurrentProfile, hideAllViews, renderAvatar, openPlayerProfileModal } from "./app.js";
import { localDateStr, toDate } from "./season.js";

const duelsCol = collection(db, "dailySession", "current", "duels");
const usersCol = collection(db, "users");

const WINDOW_DAYS = 30;
// Un joueur compte comme "régulier" s'il a joué au moins un duel sur au
// moins ce nombre de journées DISTINCTES dans la fenêtre de 30 jours — pas
// juste "beaucoup de duels le même jour", pour vraiment mesurer le retour
// en boutique, pas l'assiduité un seul soir.
const REGULAR_MIN_DAYS = 3;
// Nombre de blocs de 7 jours affichés (couvre toute la fenêtre de 30 jours
// — 30/7 arrondi au-dessus ; le dernier bloc, le plus ancien, ne compte que
// 2 jours).
const WEEK_BUCKETS = 5;

function isOrganizer() {
  return getCurrentProfile()?.role === "organisateur";
}

// ---------------------------------------------------------------------------
// Utilitaires purs (testés directement, sans Firestore)
// ---------------------------------------------------------------------------
function addDaysStr(dateStr, delta) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return localDateStr(dt);
}

// Ne garde que les duels résolus dans les WINDOW_DAYS derniers jours
// (bornes incluses, aujourd'hui inclus).
export function filterDuelsInWindow(duels, todayStr = localDateStr(), windowDays = WINDOW_DAYS) {
  const cutoff = addDaysStr(todayStr, -(windowDays - 1));
  return (duels || []).filter((d) => {
    if (d.status !== "termine" || !d.resolvedAt) return false;
    const dateStr = localDateStr(toDate(d.resolvedAt));
    return dateStr >= cutoff && dateStr <= todayStr;
  });
}

// Nombre de joueurs distincts ayant joué au moins un duel dans la fenêtre.
export function computeTotalActivePlayers(duelsInWindow) {
  const uids = new Set();
  (duelsInWindow || []).forEach((d) => {
    if (d.fromUid) uids.add(d.fromUid);
    if (d.toUid) uids.add(d.toUid);
  });
  return uids.size;
}

// Joueurs actifs par semaine glissante (blocs de 7 jours, du plus ancien au
// plus récent) sur la fenêtre de 30 jours.
export function computeWeeklyActivePlayers(duelsInWindow, todayStr = localDateStr(), weekBuckets = WEEK_BUCKETS) {
  const buckets = [];
  for (let i = 0; i < weekBuckets; i++) {
    const end = addDaysStr(todayStr, -7 * i);
    const start = addDaysStr(todayStr, -7 * i - 6);
    buckets.push({ start, end, uids: new Set() });
  }
  (duelsInWindow || []).forEach((d) => {
    const dateStr = localDateStr(toDate(d.resolvedAt));
    const bucket = buckets.find((b) => dateStr >= b.start && dateStr <= b.end);
    if (!bucket) return;
    if (d.fromUid) bucket.uids.add(d.fromUid);
    if (d.toUid) bucket.uids.add(d.toUid);
  });
  return buckets.map((b) => ({ start: b.start, end: b.end, count: b.uids.size })).reverse();
}

// Jeux classés par nombre de duels joués dans la fenêtre (le plus populaire
// en premier).
export function computeGamePopularity(duelsInWindow) {
  const counts = {};
  (duelsInWindow || []).forEach((d) => {
    if (!d.game) return;
    counts[d.game] = (counts[d.game] || 0) + 1;
  });
  return Object.entries(counts)
    .map(([game, count]) => ({ game, count }))
    .sort((a, b) => b.count - a.count || a.game.localeCompare(b.game));
}

// Joueurs "réguliers" : actifs sur au moins REGULAR_MIN_DAYS journées
// distinctes dans la fenêtre, triés par nombre de journées décroissant.
export function computeReturningPlayers(duelsInWindow, minDistinctDays = REGULAR_MIN_DAYS) {
  const daysByUid = {};
  (duelsInWindow || []).forEach((d) => {
    const dateStr = localDateStr(toDate(d.resolvedAt));
    [d.fromUid, d.toUid].forEach((uid) => {
      if (!uid) return;
      if (!daysByUid[uid]) daysByUid[uid] = new Set();
      daysByUid[uid].add(dateStr);
    });
  });
  return Object.entries(daysByUid)
    .map(([uid, days]) => ({ uid, activeDays: days.size }))
    .filter((r) => r.activeDays >= minDistinctDays)
    .sort((a, b) => b.activeDays - a.activeDays);
}

// ---------------------------------------------------------------------------
// État local + écoutes (uniquement pendant que l'écran est ouvert)
// ---------------------------------------------------------------------------
let duels = [];
let usersAll = [];
let listening = false;
let unsubDuels = null;
let unsubUsers = null;

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}
function formatFrDate(dateStr) {
  const [y, m, d] = (dateStr || "").split("-");
  return y && m && d ? `${d}/${m}` : dateStr || "";
}
function pseudoFor(uid) {
  return usersAll.find((u) => u.id === uid) || { id: uid, pseudo: "?" };
}

function render() {
  const el = $("#dash-summary");
  if (!el) return; // écran pas monté (ou fermé entre-temps)

  const inWindow = filterDuelsInWindow(duels);
  const totalActive = computeTotalActivePlayers(inWindow);
  const weekly = computeWeeklyActivePlayers(inWindow);
  const games = computeGamePopularity(inWindow);
  const regulars = computeReturningPlayers(inWindow);

  el.innerHTML = `
    <h3>📊 Vue d'ensemble — 30 derniers jours</h3>
    <div class="stat-row">
      <div class="stat-box"><b>${totalActive}</b><span>Joueurs actifs</span></div>
      <div class="stat-box"><b>${inWindow.length}</b><span>Duels joués</span></div>
      <div class="stat-box"><b>${regulars.length}</b><span>Réguliers (3j+)</span></div>
    </div>
    <p class="settings-note">Basé sur l'activité du Duel du jour (les tournois « Événement » ne sont pas comptés ici). Fenêtre glissante de 30 jours, pas un mois civil.</p>
  `;

  const weeklyEl = $("#dash-weekly");
  if (weeklyEl) {
    let html = `<h3>📅 Joueurs actifs par semaine</h3>`;
    if (!inWindow.length) {
      html += `<p class="settings-note">Aucun duel enregistré sur les 30 derniers jours.</p>`;
    } else {
      weekly.forEach((w) => {
        html += `
          <div class="dd-row">
            <div class="dd-row-name">${formatFrDate(w.start)} → ${formatFrDate(w.end)}</div>
            <div class="dd-row-actions"><span class="dd-pill">${w.count} joueur${w.count > 1 ? "s" : ""}</span></div>
          </div>`;
      });
    }
    weeklyEl.innerHTML = html;
  }

  const gamesEl = $("#dash-games");
  if (gamesEl) {
    let html = `<h3>🎲 Jeu le plus populaire</h3>`;
    if (!games.length) {
      html += `<p class="settings-note">Aucun duel enregistré sur les 30 derniers jours.</p>`;
    } else {
      games.forEach((g, idx) => {
        html += `
          <div class="dd-row">
            <div class="dd-row-name">${idx === 0 ? "🥇 " : ""}${escapeHtml(g.game)}</div>
            <div class="dd-row-actions"><span class="dd-pill">${g.count} duel${g.count > 1 ? "s" : ""}</span></div>
          </div>`;
      });
    }
    gamesEl.innerHTML = html;
  }

  const regularsEl = $("#dash-regulars");
  if (regularsEl) {
    let html = `<h3>🔁 Joueurs réguliers</h3><p class="settings-note">A joué au moins un duel sur ${REGULAR_MIN_DAYS} journées différentes ou plus, dans les 30 derniers jours.</p>`;
    if (!regulars.length) {
      html += `<p class="settings-note">Personne ne remplit ce critère pour l'instant.</p>`;
      regularsEl.innerHTML = html;
    } else {
      regularsEl.innerHTML = html;
      regulars.forEach((r) => {
        const p = pseudoFor(r.uid);
        const row = document.createElement("div");
        row.className = "dd-row";
        row.innerHTML = `
          <div class="dd-row-avatar" data-avatar="${r.uid}"></div>
          <div class="dd-row-name">${escapeHtml(p.pseudo || "?")}</div>
          <div class="dd-row-actions"><span class="dd-pill">${r.activeDays} jours</span> <button class="btn-mini btn-mini-ghost" data-uid="${r.uid}">Voir le profil</button></div>
        `;
        regularsEl.appendChild(row);
        const holder = row.querySelector(`[data-avatar="${r.uid}"]`);
        if (holder) renderAvatar(holder, p, 34);
        row.querySelector("button").addEventListener("click", () => openPlayerProfileModal(r.uid));
      });
    }
  }
}

function startListening() {
  if (listening) return;
  listening = true;
  unsubDuels = onSnapshot(duelsCol, (snap) => {
    duels = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  });
  unsubUsers = onSnapshot(usersCol, (snap) => {
    usersAll = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  });
}
function stopListening() {
  unsubDuels?.();
  unsubUsers?.();
  unsubDuels = unsubUsers = null;
  duels = [];
  usersAll = [];
  listening = false;
}

export function showDashboardScreen() {
  if (!isOrganizer()) return;
  hideAllViews();
  $("#view-dashboard")?.classList.add("active");
  startListening();
}
function closeDashboardScreen() {
  hideAllViews();
  $("#view-app")?.classList.add("active");
  stopListening();
}

document.addEventListener("DOMContentLoaded", () => {
  $("#btn-open-dashboard")?.addEventListener("click", showDashboardScreen);
  $("#btn-close-dashboard")?.addEventListener("click", closeDashboardScreen);
});
