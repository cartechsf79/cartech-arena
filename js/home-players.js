// ============================================================================
// Car'Tech Arena — liste des joueurs sur l'écran d'accueil
// Statut dérivé en direct : "disponible" (présent en boutique, dans le Duel
// du jour), "en combat" (duel en cours ou match d'Événement en cours), sinon
// "inactif". Tous les comptes créés apparaissent, pas seulement ceux déjà
// venus en boutique.
// ============================================================================
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import { db } from "./firebase-init.js";
import { $, renderAvatar, openPlayerProfileModal } from "./app.js";

const usersCol = collection(db, "users");
const dailyParticipantsCol = collection(db, "dailySession", "current", "participants");
const eventsCol = collection(db, "events");

let usersAll = [];
let dailyParticipants = [];
let activeEventId = null;
let eventMatches = [];
let unsubUsers = null;
let unsubDaily = null;
let unsubEvents = null;
let unsubMatches = null;
let started = false;

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

function statusLabel(status) {
  if (status === "disponible") return "🟢 Disponible";
  if (status === "en_combat") return "🔴 En combat";
  return "⚪ Inactif";
}

function render() {
  const container = $("#home-players-list");
  if (!container) return;

  const dailyStatusByUid = {};
  dailyParticipants.forEach((p) => (dailyStatusByUid[p.id] = p.status));

  // Un joueur est "en combat" s'il a un match d'Événement en cours (manche
  // actuelle, pas un tour de repos) OU un duel accepté en cours dans le Duel
  // du jour — les deux systèmes de présence restent indépendants.
  const combatUids = new Set();
  eventMatches.forEach((m) => {
    if (m.isBye || m.status === "termine") return;
    if (m.player1Uid) combatUids.add(m.player1Uid);
    if (m.player2Uid) combatUids.add(m.player2Uid);
  });

  const rows = usersAll.map((u) => {
    let status = "inactif";
    if (combatUids.has(u.id) || dailyStatusByUid[u.id] === "en_duel") status = "en_combat";
    else if (dailyStatusByUid[u.id] === "disponible") status = "disponible";
    return { ...u, status };
  });

  const order = { disponible: 0, en_combat: 1, inactif: 2 };
  rows.sort((a, b) => order[a.status] - order[b.status] || (a.pseudo || "").localeCompare(b.pseudo || ""));

  container.innerHTML = "";
  if (!rows.length) {
    container.innerHTML = `<p class="settings-note">Aucun joueur pour l'instant.</p>`;
    return;
  }
  rows.forEach((p) => {
    const row = document.createElement("div");
    row.className = `home-player-row status-${p.status}`;
    row.innerHTML = `
      <span class="home-player-dot"></span>
      <div class="dd-row-avatar" data-avatar="${p.id}"></div>
      <div class="dd-row-name">${escapeHtml(p.pseudo || "?")}<span class="dd-pill home-player-status-label">${statusLabel(p.status)}</span></div>
      <button class="btn-mini btn-mini-ghost" type="button" data-uid="${p.id}">Voir le profil</button>
    `;
    container.appendChild(row);
    const holder = row.querySelector(`[data-avatar="${p.id}"]`);
    if (holder) renderAvatar(holder, p, 36);
    row.querySelector("button").addEventListener("click", () => openPlayerProfileModal(p.id));
  });
}

function attachEventMatchesListener() {
  if (unsubMatches) {
    unsubMatches();
    unsubMatches = null;
  }
  eventMatches = [];
  if (!activeEventId) {
    render();
    return;
  }
  unsubMatches = onSnapshot(collection(db, "events", activeEventId, "matches"), (snap) => {
    eventMatches = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  });
}

// ---------------------------------------------------------------------------
// Démarré/arrêté depuis app.js, en même temps que les autres écoutes
// globales (catalogues) — à la connexion / déconnexion.
// ---------------------------------------------------------------------------
export function startHomePlayersListener() {
  if (started) return;
  started = true;
  unsubUsers = onSnapshot(usersCol, (snap) => {
    usersAll = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  });
  unsubDaily = onSnapshot(dailyParticipantsCol, (snap) => {
    dailyParticipants = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  });
  unsubEvents = onSnapshot(eventsCol, (snap) => {
    const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const open = all.find((e) => e.status !== "termine") || null;
    const newId = open ? open.id : null;
    if (newId !== activeEventId) {
      activeEventId = newId;
      attachEventMatchesListener();
    }
  });
}

export function stopHomePlayersListener() {
  [unsubUsers, unsubDaily, unsubEvents, unsubMatches].forEach((u) => u && u());
  unsubUsers = unsubDaily = unsubEvents = unsubMatches = null;
  usersAll = [];
  dailyParticipants = [];
  eventMatches = [];
  activeEventId = null;
  started = false;
}
