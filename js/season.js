// ============================================================================
// Car'Tech Arena — Saisons
// Périodes programmées par l'organisateur (date de début / date de fin)
// pendant lesquelles les joueurs gagnent des points via le Duel du jour :
//   - victoire = 3 points, défaite = 1 point ;
//   - maximum 15 points gagnés par JOURNÉE (une fois atteint, le joueur peut
//     toujours jouer mais ne gagne plus de points ce jour-là — son
//     adversaire, lui, continue d'en gagner normalement) ;
//   - le classement (points/victoires/défaites/matchs/place) est toujours
//     RECALCULÉ à partir de l'historique des duels déjà validés
//     (dailySession/current/duels), jamais stocké/incrémenté à la main —
//     même philosophie que le reste de l'appli : on ne fait pas confiance à
//     un compteur qu'un client pourrait fausser.
//   - seule exception (documentée dans firestore.rules) : le tag de saison,
//     qu'un joueur peut s'attribuer TOUT SEUL dès qu'il a joué un match
//     cette saison-ci, dans une mesure très étroite et revérifiée côté
//     serveur (voir isValidSelfSeasonTagGrant).
// ============================================================================
import {
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  collection,
  onSnapshot,
  arrayUnion,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import { db } from "./firebase-init.js";
import {
  $,
  getCurrentProfile,
  getCurrentUid,
  renderProfile,
  showToast,
  friendlyError,
  renderAvatar,
  hideAllViews,
  openPlayerProfileModal,
} from "./app.js";

const seasonsCol = collection(db, "seasons");
const tagsCol = collection(db, "tags");
const usersCol = collection(db, "users");
const duelsCol = collection(db, "dailySession", "current", "duels");

const WIN_POINTS = 3;
const LOSS_POINTS = 1;
const MAX_POINTS_PER_DAY = 15;
// Couleur du tag de saison, auto-créé à chaque nouvelle saison — un ton "or"
// distinct des tags que l'organisateur crée normalement, pour qu'il soit
// facilement reconnaissable dans la liste des tags.
const SEASON_TAG_COLOR = "#f5b942";

function isOrganizer() {
  return getCurrentProfile()?.role === "organisateur";
}

// ---------------------------------------------------------------------------
// Utilitaires purs (testés directement, sans Firestore) — date locale
// "YYYY-MM-DD", conversion Timestamp/chaîne -> Date (même logique que
// event.js), saison active, calcul du classement d'une saison.
// ---------------------------------------------------------------------------
export function localDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function toDate(v) {
  if (!v) return new Date();
  if (typeof v.toDate === "function") return v.toDate();
  return new Date(v);
}

// Une saison est "active" si aujourd'hui tombe dans [startDate, endDate]
// (chaînes "YYYY-MM-DD", comparables directement). S'il y en a plusieurs en
// même temps (l'organisateur a créé des saisons qui se chevauchent par
// erreur), on prend la première trouvée — cas limite non géré plus finement.
export function getActiveSeason(seasons, todayStr = localDateStr()) {
  return seasons.find((s) => s.startDate <= todayStr && todayStr <= s.endDate) || null;
}

// Calcule, pour CHAQUE joueur apparaissant dans au moins un duel validé de
// la saison, ses points (plafonnés à MAX_POINTS_PER_DAY par jour calendaire),
// son nombre de matchs/victoires/défaites (jamais plafonnés, contrairement
// aux points). `duels` = tous les documents de dailySession/current/duels
// (accumulés depuis toujours, filtrés ici par date de résolution).
export function computeSeasonStandings(duels, season) {
  const standings = {}; // uid -> { points, wins, losses, matches }
  const dayPoints = {}; // uid -> { "YYYY-MM-DD": pointsBruts }

  function bump(uid, won, dateStr) {
    if (!standings[uid]) standings[uid] = { points: 0, wins: 0, losses: 0, matches: 0 };
    if (!dayPoints[uid]) dayPoints[uid] = {};
    standings[uid].matches += 1;
    if (won) standings[uid].wins += 1;
    else standings[uid].losses += 1;
    dayPoints[uid][dateStr] = (dayPoints[uid][dateStr] || 0) + (won ? WIN_POINTS : LOSS_POINTS);
  }

  (duels || []).forEach((d) => {
    if (d.status !== "termine" || !d.resolvedAt) return;
    const dateStr = localDateStr(toDate(d.resolvedAt));
    if (dateStr < season.startDate || dateStr > season.endDate) return;
    if (!d.resultFrom || !d.resultTo) return;
    bump(d.fromUid, !!d.resultFrom.iWon, dateStr);
    bump(d.toUid, !!d.resultTo.iWon, dateStr);
  });

  Object.keys(standings).forEach((uid) => {
    const capped = Object.values(dayPoints[uid] || {}).reduce((sum, raw) => sum + Math.min(raw, MAX_POINTS_PER_DAY), 0);
    standings[uid].points = capped;
  });

  return standings;
}

// Fusionne le classement calculé avec TOUS les comptes existants (un joueur
// qui n'a jamais joué apparaît quand même, à 0) puis trie par points
// décroissants (départage : victoires, puis moins de matchs joués, puis
// pseudo pour un ordre toujours stable).
export function buildLeaderboardRows(usersAll, standings) {
  return usersAll
    .map((u) => ({
      id: u.id,
      pseudo: u.pseudo || "?",
      photoDataUrl: u.photoDataUrl || null,
      decorations: u.decorations || null,
      ...(standings[u.id] || { points: 0, wins: 0, losses: 0, matches: 0 }),
    }))
    .sort((a, b) => b.points - a.points || b.wins - a.wins || a.matches - b.matches || a.pseudo.localeCompare(b.pseudo));
}

// ---------------------------------------------------------------------------
// État local
// ---------------------------------------------------------------------------
let seasons = []; // toutes les saisons (passées/actuelle/futures)
let duels = [];
let usersAll = [];
let bannerListening = false;
let bannerUnsub = null;
let heavyListening = false;
let heavyUnsubs = [];
let grantAttemptedFor = null; // id de saison pour laquelle on a déjà tenté l'auto-attribution du tag cette session

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

function formatFr(dateStr) {
  // "YYYY-MM-DD" -> "JJ/MM/AAAA", sans dépendre du fuseau (simple découpage
  // de chaîne, pas de passage par Date() qui réinterpréterait le fuseau).
  const [y, m, d] = (dateStr || "").split("-");
  return y && m && d ? `${d}/${m}/${y}` : dateStr || "";
}

// ---------------------------------------------------------------------------
// Bandeau "saison en cours" — écran d'accueil, léger (juste /seasons),
// démarré/arrêté en même temps que les autres écoutes globales.
// ---------------------------------------------------------------------------
function renderBanner() {
  const el = $("#season-banner");
  if (!el) return;
  const active = getActiveSeason(seasons);
  if (!active) {
    el.style.display = "none";
    el.innerHTML = "";
    return;
  }
  el.style.display = "";
  el.innerHTML = `📅 <b>Saison ${active.seasonNumber}</b> en cours — du ${formatFr(active.startDate)} au ${formatFr(active.endDate)}`;
}

export function startSeasonBannerListener() {
  if (bannerListening) return;
  bannerListening = true;
  bannerUnsub = onSnapshot(seasonsCol, (snap) => {
    seasons = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderBanner();
  });
}
export function stopSeasonBannerListener() {
  bannerUnsub?.();
  bannerUnsub = null;
  seasons = [];
  bannerListening = false;
  grantAttemptedFor = null;
}

// ---------------------------------------------------------------------------
// Actions organisateur — créer / supprimer une saison
// ---------------------------------------------------------------------------
async function createSeason(startDate, endDate) {
  const nextNumber = seasons.reduce((max, s) => Math.max(max, s.seasonNumber || 0), 0) + 1;
  const tagRef = await addDoc(tagsCol, {
    name: `Saison ${nextNumber}`,
    color: SEASON_TAG_COLOR,
    defaultOwned: false,
    autoGrant: true,
    createdAt: serverTimestamp(),
  });
  await addDoc(seasonsCol, {
    seasonNumber: nextNumber,
    startDate,
    endDate,
    tagId: tagRef.id,
    createdAt: serverTimestamp(),
  });
}

async function deleteSeason(seasonId) {
  await deleteDoc(doc(seasonsCol, seasonId));
}

// ---------------------------------------------------------------------------
// Attribution automatique du tag de saison, dès que MON nombre de matchs
// cette saison passe à 1 ou plus — voir isValidSelfSeasonTagGrant dans
// firestore.rules pour la contre-vérification côté serveur.
// ---------------------------------------------------------------------------
async function maybeGrantSeasonTag(activeSeason, myMatches) {
  if (!activeSeason || myMatches < 1) return;
  const profile = getCurrentProfile();
  const uid = getCurrentUid();
  if (!profile || !uid) return;
  if ((profile.tags?.owned || []).includes(activeSeason.tagId)) return;
  if (grantAttemptedFor === activeSeason.id) return;
  grantAttemptedFor = activeSeason.id;
  try {
    await updateDoc(doc(usersCol, uid), { "tags.owned": arrayUnion(activeSeason.tagId) });
    const updated = { ...profile, tags: { ...profile.tags, owned: [...(profile.tags?.owned || []), activeSeason.tagId] } };
    renderProfile(updated);
    showToast(`Tag « Saison ${activeSeason.seasonNumber} » débloqué !`);
  } catch (err) {
    // Pas grave si ça échoue (ex. le tag a été supprimé entre-temps par
    // l'organisateur) — le classement/les points restent corrects, seul le
    // tag cosmétique manquerait.
    console.error(err);
  }
}

// ---------------------------------------------------------------------------
// Rendu — panneau organisateur (créer / lister / supprimer des saisons)
// ---------------------------------------------------------------------------
function renderOrganizerPanel() {
  const el = $("#season-organizer-panel");
  if (!el) return;
  if (!isOrganizer()) {
    el.style.display = "none";
    return;
  }
  el.style.display = "";

  const sorted = seasons.slice().sort((a, b) => (b.seasonNumber || 0) - (a.seasonNumber || 0));
  const todayStr = localDateStr();

  let html = `
    <h3>🛡️ Organisateur — Saisons</h3>
    <p class="settings-note">Programme une nouvelle saison avec ses dates de début et de fin — elle démarrera/se terminera toute seule à ces dates.</p>
    <form id="form-create-season">
      <label for="season-start">Date de début</label>
      <input type="date" id="season-start" required>
      <label for="season-end">Date de fin</label>
      <input type="date" id="season-end" required>
      <button class="btn btn-primary" type="submit">Programmer la saison</button>
    </form>
  `;

  if (sorted.length) {
    html += `<div class="manage-grid-label">Saisons existantes</div>`;
    sorted.forEach((s) => {
      const active = s.startDate <= todayStr && todayStr <= s.endDate;
      html += `
        <div class="dd-row" data-season="${s.id}">
          <div class="dd-row-name">Saison ${s.seasonNumber} — du ${formatFr(s.startDate)} au ${formatFr(s.endDate)} ${active ? '<span class="dd-pill">🟢 en cours</span>' : ""}</div>
          <div class="dd-row-actions">
            <button class="btn-mini btn-mini-no" data-action="delete-season" data-id="${s.id}">Supprimer</button>
          </div>
        </div>`;
    });
  }

  el.innerHTML = html;
  $("#form-create-season")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const start = $("#season-start").value;
    const end = $("#season-end").value;
    if (!start || !end) return;
    if (end < start) {
      showToast("La date de fin doit être après la date de début.", true);
      return;
    }
    withErrorToast(async () => {
      await createSeason(start, end);
      showToast("Saison programmée !");
    });
  });
  el.querySelectorAll('[data-action="delete-season"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!confirm("Supprimer définitivement cette saison ?")) return;
      withErrorToast(() => deleteSeason(btn.dataset.id));
    });
  });
}

async function withErrorToast(fn) {
  try {
    await fn();
  } catch (err) {
    console.error(err);
    showToast(friendlyError(err), true);
  }
}

// ---------------------------------------------------------------------------
// Rendu — mes stats + classement complet de la saison en cours
// ---------------------------------------------------------------------------
function renderPlayerArea() {
  const el = $("#season-player-area");
  if (!el) return;

  const active = getActiveSeason(seasons);
  if (!active) {
    el.innerHTML = `<p class="settings-note">Aucune saison en cours pour l'instant.</p>`;
    return;
  }

  const standings = computeSeasonStandings(duels, active);
  const rows = buildLeaderboardRows(usersAll, standings);
  const myUid = getCurrentUid();
  const myIndex = rows.findIndex((r) => r.id === myUid);
  const mine = myIndex >= 0 ? rows[myIndex] : { points: 0, wins: 0, losses: 0, matches: 0 };
  const myRank = myIndex >= 0 ? myIndex + 1 : rows.length;

  maybeGrantSeasonTag(active, mine.matches);

  let html = `
    <h3>🏅 Saison ${active.seasonNumber}</h3>
    <p class="settings-note">Du ${formatFr(active.startDate)} au ${formatFr(active.endDate)} — points gagnés via le Duel du jour (victoire = ${WIN_POINTS} pts, défaite = ${LOSS_POINTS} pt, ${MAX_POINTS_PER_DAY} pts max par journée).</p>
    <div class="stat-row">
      <div class="stat-box"><b>${mine.points}</b><span>Points</span></div>
      <div class="stat-box"><b>${mine.matches}</b><span>Matchs</span></div>
      <div class="stat-box"><b>${mine.wins}</b><span>Victoires</span></div>
      <div class="stat-box"><b>${mine.losses}</b><span>Défaites</span></div>
    </div>
    <p class="settings-note">Ta place actuelle : <b>${myRank}${myRank === 1 ? "ère" : "ème"}</b> sur ${rows.length}.</p>
    <div class="manage-grid-label">Classement de la saison</div>
    <div id="season-leaderboard"></div>
  `;

  el.innerHTML = html;

  const board = $("#season-leaderboard");
  rows.forEach((r, idx) => {
    const row = document.createElement("div");
    row.className = "dd-row season-row" + (r.id === myUid ? " season-row-me" : "");
    row.innerHTML = `
      <div class="season-rank">#${idx + 1}</div>
      <div class="dd-row-avatar" data-avatar="${r.id}"></div>
      <div class="dd-row-name">${escapeHtml(r.pseudo)} <span class="dd-pill">${r.points} pts</span></div>
      <div class="dd-row-actions">
        <button class="btn-mini btn-mini-ghost" data-action="view-profile" data-uid="${r.id}">Voir profil</button>
      </div>
    `;
    board.appendChild(row);
    const holder = row.querySelector(`[data-avatar="${r.id}"]`);
    if (holder) renderAvatar(holder, r, 34);
  });
  board.querySelectorAll('[data-action="view-profile"]').forEach((btn) => {
    btn.addEventListener("click", () => openPlayerProfileModal(btn.dataset.uid));
  });
}

function render() {
  renderBanner();
  renderOrganizerPanel();
  renderPlayerArea();
}

// ---------------------------------------------------------------------------
// Écoutes lourdes (duels + tous les comptes) — seulement pendant que l'écran
// Saison est ouvert, comme pour le Duel du jour / l'Événement.
// ---------------------------------------------------------------------------
function startHeavyListening() {
  if (heavyListening) return;
  heavyListening = true;
  heavyUnsubs.push(
    onSnapshot(duelsCol, (snap) => {
      duels = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      render();
    })
  );
  heavyUnsubs.push(
    onSnapshot(usersCol, (snap) => {
      usersAll = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      render();
    })
  );
}
function stopHeavyListening() {
  heavyUnsubs.forEach((u) => u());
  heavyUnsubs = [];
  heavyListening = false;
  duels = [];
  usersAll = [];
}

export function showSeasonScreen() {
  hideAllViews();
  $("#view-season")?.classList.add("active");
  startHeavyListening();
  render();
}
function closeSeasonScreen() {
  hideAllViews();
  $("#view-app")?.classList.add("active");
  stopHeavyListening();
}

document.addEventListener("DOMContentLoaded", () => {
  $("#btn-open-season")?.addEventListener("click", showSeasonScreen);
  $("#btn-close-season")?.addEventListener("click", closeSeasonScreen);
});
