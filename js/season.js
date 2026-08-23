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
  getDocs,
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
import { getAllGames, getGameWinCondition } from "./live-catalog.js";

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
// aux points), et ses "points cumulés" — un DÉPARTAGE, pas un classement en
// soi (voir buildLeaderboardRows) : pour chaque duel de la saison, une
// performance est ramenée sur une base de 100 par rapport à la "condition
// pour gagner" configurée sur ce jeu (voir js/live-catalog.js), pour que
// jouer un jeu où il faut 40 points ne pèse pas 2× plus qu'un jeu où il en
// faut 20. Cette performance dépend du TYPE de condition :
//   - "point_maximal" (course à un score) : le score obtenu par le joueur
//     lui-même, ramené sur 100 — ex. 15 points sur un jeu qui en demande 20
//     -> 75, qu'il ait gagné ou perdu ce duel-là.
//   - "point_defaite" (points de vie de départ, élimination) : les
//     "points de vie" saisis dans le formulaire de résultat sont ceux qui
//     RESTENT à chaque joueur à la fin du duel, donc la performance de CE
//     joueur, c'est plutôt les dégâts qu'IL a infligés à son adversaire —
//     (vie de départ − vie restante de l'ADVERSAIRE), ramené sur 100. Sans
//     ça, un joueur qui perd (0 point de vie restant) aurait toujours 0
//     point cumulé, même après un match très serré — alors qu'avec les
//     dégâts infligés, il garde le crédit de la vie qu'il a fait perdre à
//     son adversaire avant de mourir, symétrique du cas "point_maximal".
// `duels` = tous les documents de dailySession/current/duels (accumulés
// depuis toujours, filtrés ici par date de résolution). `gameWinConditions`
// = { [nomDuJeu]: { type, value } }, un jeu sans condition configurée ne
// contribue simplement à aucun point cumulé pour ce duel-là (ni pour l'un ni
// pour l'autre joueur).
export function computeSeasonStandings(duels, season, gameWinConditions = {}) {
  const standings = {}; // uid -> { points, wins, losses, matches, pointsCumules }
  const dayPoints = {}; // uid -> { "YYYY-MM-DD": pointsBruts }

  function bump(uid, won, dateStr) {
    if (!standings[uid]) standings[uid] = { points: 0, wins: 0, losses: 0, matches: 0, pointsCumules: 0 };
    if (!dayPoints[uid]) dayPoints[uid] = {};
    standings[uid].matches += 1;
    if (won) standings[uid].wins += 1;
    else standings[uid].losses += 1;
    dayPoints[uid][dateStr] = (dayPoints[uid][dateStr] || 0) + (won ? WIN_POINTS : LOSS_POINTS);
  }

  // Ajoute la performance de CE joueur dans CE duel (déjà ramenée sur 100,
  // plafonnée des deux côtés) à ses points cumulés de la saison.
  function bumpPointsCumules(uid, ratio) {
    if (!standings[uid] || !Number.isFinite(ratio)) return;
    standings[uid].pointsCumules += Math.max(0, Math.min(100, ratio));
  }

  (duels || []).forEach((d) => {
    if (d.status !== "termine" || !d.resolvedAt) return;
    const dateStr = localDateStr(toDate(d.resolvedAt));
    if (dateStr < season.startDate || dateStr > season.endDate) return;
    if (!d.resultFrom || !d.resultTo) return;
    bump(d.fromUid, !!d.resultFrom.iWon, dateStr);
    bump(d.toUid, !!d.resultTo.iWon, dateStr);

    const wc = gameWinConditions[d.game];
    if (wc && wc.value > 0) {
      if (wc.type === "point_defaite") {
        // Dégâts infligés = vie de départ − vie restante de l'ADVERSAIRE.
        // resultFrom.oppScore et resultTo.myScore désignent tous les deux
        // "la vie restante de toUid" (les deux résultats sont vérifiés
        // concordants avant qu'un duel passe à "termine") — l'un ou l'autre
        // fait donc l'affaire.
        const damageByFrom = wc.value - Number(d.resultFrom.oppScore);
        const damageByTo = wc.value - Number(d.resultTo.oppScore);
        bumpPointsCumules(d.fromUid, (damageByFrom / wc.value) * 100);
        bumpPointsCumules(d.toUid, (damageByTo / wc.value) * 100);
      } else {
        const fromRatio = (Number(d.resultFrom.myScore) / wc.value) * 100;
        const toRatio = (Number(d.resultTo.myScore) / wc.value) * 100;
        bumpPointsCumules(d.fromUid, fromRatio);
        bumpPointsCumules(d.toUid, toRatio);
      }
    }
  });

  Object.keys(standings).forEach((uid) => {
    const capped = Object.values(dayPoints[uid] || {}).reduce((sum, raw) => sum + Math.min(raw, MAX_POINTS_PER_DAY), 0);
    standings[uid].points = capped;
    standings[uid].pointsCumules = Math.round(standings[uid].pointsCumules);
  });

  return standings;
}

// Construit, à partir du catalogue de jeux, la table { nomDuJeu: {type,value} }
// attendue par computeSeasonStandings — un jeu sans condition configurée est
// simplement absent de la table.
export function buildGameWinConditionsMap() {
  const map = {};
  getAllGames().forEach((name) => {
    const wc = getGameWinCondition(name);
    if (wc) map[name] = wc;
  });
  return map;
}

// Fusionne le classement calculé avec TOUS les comptes existants (un joueur
// qui n'a jamais joué apparaît quand même, à 0) puis trie par points
// décroissants (départage : points cumulés — voir computeSeasonStandings —,
// puis victoires, puis moins de matchs joués, puis pseudo pour un ordre
// toujours stable).
export function buildLeaderboardRows(usersAll, standings) {
  return usersAll
    .map((u) => ({
      id: u.id,
      pseudo: u.pseudo || "?",
      photoDataUrl: u.photoDataUrl || null,
      decorations: u.decorations || null,
      ...(standings[u.id] || { points: 0, wins: 0, losses: 0, matches: 0, pointsCumules: 0 }),
    }))
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.pointsCumules - a.pointsCumules ||
        b.wins - a.wins ||
        a.matches - b.matches ||
        a.pseudo.localeCompare(b.pseudo)
    );
}

// ---------------------------------------------------------------------------
// "Carrière" d'un joueur — indicateur global affiché sur les fiches profil
// (accueil, "Voir le profil", recherche organisateur), DISTINCT du
// classement d'UNE saison ci-dessus :
//   - "points" (à vie) = somme des points gagnés sur TOUTES les saisons
//     passées/en cours (même règle 3 victoire / 1 défaite / 15 max par
//     jour que d'habitude, appliquée saison par saison puis additionnée) —
//     un match joué en dehors de toute saison ne rapporte donc aucun point.
//   - "victoires"/"défaites" (à vie) = TOUS les duels du jour terminés
//     depuis la création du compte, saison ou pas — volontairement plus
//     large que les points, pour donner une vraie idée de l'activité du
//     joueur même les périodes sans saison programmée.
//   - "points de la saison en cours" = juste le sous-total de la saison
//     actuellement active (si il y en a une), pour avoir la vision
//     complète (vie entière + saison en cours) sans changer d'écran.
// ---------------------------------------------------------------------------

// Points gagnés par UN joueur sur UNE saison donnée (même calcul que
// computeSeasonStandings, mais pour un seul uid — réutilisé à la fois pour
// le total "à vie" (somme sur toutes les saisons) et pour le sous-total de
// la saison active).
function seasonPointsForUid(duels, season, uid) {
  const dayPoints = {};
  (duels || []).forEach((d) => {
    if (d.status !== "termine" || !d.resolvedAt) return;
    const dateStr = localDateStr(toDate(d.resolvedAt));
    if (dateStr < season.startDate || dateStr > season.endDate) return;
    if (!d.resultFrom || !d.resultTo) return;
    let won;
    if (d.fromUid === uid) won = !!d.resultFrom.iWon;
    else if (d.toUid === uid) won = !!d.resultTo.iWon;
    else return;
    dayPoints[dateStr] = (dayPoints[dateStr] || 0) + (won ? WIN_POINTS : LOSS_POINTS);
  });
  return Object.values(dayPoints).reduce((sum, raw) => sum + Math.min(raw, MAX_POINTS_PER_DAY), 0);
}

// Points ET victoires/défaites d'UN joueur sur UNE saison donnée — variante
// de seasonPointsForUid ci-dessus qui garde aussi le décompte victoires/
// défaites (jamais plafonné, contrairement aux points). Utilisée uniquement
// pour la saison ACTIVE (voir computeCareerStats) : les saisons passées
// n'ont besoin que du sous-total de points pour le total "à vie".
function seasonStatsForUid(duels, season, uid) {
  let wins = 0;
  let losses = 0;
  const dayPoints = {};
  (duels || []).forEach((d) => {
    if (d.status !== "termine" || !d.resolvedAt) return;
    const dateStr = localDateStr(toDate(d.resolvedAt));
    if (dateStr < season.startDate || dateStr > season.endDate) return;
    if (!d.resultFrom || !d.resultTo) return;
    let won;
    if (d.fromUid === uid) won = !!d.resultFrom.iWon;
    else if (d.toUid === uid) won = !!d.resultTo.iWon;
    else return;
    if (won) wins += 1;
    else losses += 1;
    dayPoints[dateStr] = (dayPoints[dateStr] || 0) + (won ? WIN_POINTS : LOSS_POINTS);
  });
  const points = Object.values(dayPoints).reduce((sum, raw) => sum + Math.min(raw, MAX_POINTS_PER_DAY), 0);
  return { points, wins, losses };
}

export function computeCareerStats(duels, seasons, uid) {
  let lifetimeWins = 0;
  let lifetimeLosses = 0;
  (duels || []).forEach((d) => {
    if (d.status !== "termine" || !d.resultFrom || !d.resultTo) return;
    if (d.fromUid === uid) {
      if (d.resultFrom.iWon) lifetimeWins += 1;
      else lifetimeLosses += 1;
    } else if (d.toUid === uid) {
      if (d.resultTo.iWon) lifetimeWins += 1;
      else lifetimeLosses += 1;
    }
  });

  const lifetimePoints = (seasons || []).reduce((sum, s) => sum + seasonPointsForUid(duels, s, uid), 0);
  const active = getActiveSeason(seasons || []);
  const currentSeason = active ? seasonStatsForUid(duels, active, uid) : { points: 0, wins: 0, losses: 0 };

  return {
    lifetimePoints,
    lifetimeWins,
    lifetimeLosses,
    currentSeasonPoints: currentSeason.points,
    currentSeasonWins: currentSeason.wins,
    currentSeasonLosses: currentSeason.losses,
    currentSeasonNumber: active ? active.seasonNumber : null,
  };
}

// ---------------------------------------------------------------------------
// Face-à-face entre 2 joueurs précis — combien de fois uidA a battu uidB et
// vice versa, tous duels confondus (peu importe la saison). Utilisé sur la
// popup "Voir le profil" pour montrer directement le bilan entre la personne
// qui regarde et celle dont elle consulte le profil.
// ---------------------------------------------------------------------------
export function computeHeadToHead(duels, uidA, uidB) {
  let aWins = 0;
  let bWins = 0;
  let matches = 0;
  (duels || []).forEach((d) => {
    if (d.status !== "termine" || !d.resultFrom || !d.resultTo) return;
    if (d.fromUid === uidA && d.toUid === uidB) {
      matches += 1;
      if (d.resultFrom.iWon) aWins += 1;
      else bWins += 1;
    } else if (d.fromUid === uidB && d.toUid === uidA) {
      matches += 1;
      if (d.resultTo.iWon) aWins += 1;
      else bWins += 1;
    }
  });
  return { aWins, bWins, matches };
}

// Version "à la demande" (un seul appel réseau), même esprit que
// fetchCareerStats ci-dessous.
export async function fetchHeadToHead(uidA, uidB) {
  const duelsSnap = await getDocs(duelsCol);
  const duelsList = duelsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return computeHeadToHead(duelsList, uidA, uidB);
}

// Version "à la demande" (un seul appel réseau, pas d'écoute permanente) —
// utilisée pour une fiche profil consultée ponctuellement (recherche
// organisateur, popup "Voir le profil" d'un autre joueur).
export async function fetchCareerStats(uid) {
  const [duelsSnap, seasonsSnap] = await Promise.all([getDocs(duelsCol), getDocs(seasonsCol)]);
  const duels = duelsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const seasonsList = seasonsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return computeCareerStats(duels, seasonsList, uid);
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
    renderCareerStats();
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
// Stats "carrière" de MOI-MÊME sur l'écran d'accueil (points/victoires/
// défaites à vie + points de la saison en cours) — démarré/arrêté en même
// temps que le bandeau de saison. Volontairement léger : un seul compte à
// recalculer à chaque mise à jour (le mien), pas tous les comptes comme le
// classement de saison (qui, lui, n'écoute que pendant que l'écran Saison
// est ouvert).
// ---------------------------------------------------------------------------
let careerDuels = [];
let careerListening = false;
let careerUnsub = null;

function renderCareerStats() {
  const uid = getCurrentUid();
  const elPoints = $("#stat-points");
  const elWins = $("#stat-wins");
  const elLosses = $("#stat-losses");
  const elSeason = $("#stat-season-points");
  if (!uid || (!elPoints && !elWins && !elLosses && !elSeason)) return;
  const stats = computeCareerStats(careerDuels, seasons, uid);
  if (elPoints) elPoints.textContent = stats.lifetimePoints;
  if (elWins) elWins.textContent = stats.lifetimeWins;
  if (elLosses) elLosses.textContent = stats.lifetimeLosses;
  if (elSeason) elSeason.textContent = stats.currentSeasonNumber != null ? stats.currentSeasonPoints : "—";
}

export function startCareerStatsListener() {
  if (careerListening) return;
  careerListening = true;
  careerUnsub = onSnapshot(duelsCol, (snap) => {
    careerDuels = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderCareerStats();
  });
}
export function stopCareerStatsListener() {
  careerUnsub?.();
  careerUnsub = null;
  careerDuels = [];
  careerListening = false;
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

  const gameWinConditions = buildGameWinConditionsMap();
  const standings = computeSeasonStandings(duels, active, gameWinConditions);
  const rows = buildLeaderboardRows(usersAll, standings);
  const myUid = getCurrentUid();
  const myIndex = rows.findIndex((r) => r.id === myUid);
  const mine = myIndex >= 0 ? rows[myIndex] : { points: 0, wins: 0, losses: 0, matches: 0, pointsCumules: 0 };
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
      <div class="stat-box"><b>${mine.pointsCumules}</b><span>Points cumulés</span></div>
    </div>
    <p class="settings-note">« Points cumulés » : sert uniquement à départager deux joueurs à égalité de points — la moyenne (sur 100) de tes scores dans chaque duel de la saison, par rapport à la condition de victoire du jeu joué (pas de condition configurée = ce duel n'y contribue pas).</p>
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
