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
const pointAdjustmentsCol = collection(db, "pointAdjustments");
// Pour les points gagnés en Événement (tournoi) dans les saisons — voir
// startEventMatchesListening plus bas et computeSeasonStandings ci-dessus.
const eventsCol = collection(db, "events");

// Exportées (plutôt que gardées privées à ce module) pour être réutilisées
// telles quelles par js/organizer-display.js — classement des points du Duel
// du jour du jour même, avec exactement les mêmes règles qu'ici.
export const WIN_POINTS = 3;
export const LOSS_POINTS = 1;
export const MAX_POINTS_PER_DAY = 15;
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

// Même logique que matchWinnerUid dans event.js / organizer-display.js (voir
// leur commentaire) — dupliquée volontairement ici plutôt qu'importée, comme
// le reste de ce fichier qui garde sa propre logique de calcul indépendante.
// Un bye (isBye) est une victoire automatique du seul joueur inscrit.
function eventMatchWinnerUid(m) {
  if (m.status !== "termine") return null;
  if (m.isBye) return m.player1Uid;
  const wins1 = (m.gamesResult1 || []).filter((g) => g.iWon).length;
  const wins2 = (m.gamesResult1 || []).length - wins1;
  return wins1 > wins2 ? m.player1Uid : m.player2Uid;
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
export function computeSeasonStandings(duels, season, gameWinConditions = {}, adjustments = [], eventMatches = []) {
  const standings = {}; // uid -> { points, wins, losses, matches, pointsCumules }
  const dayPoints = {}; // uid -> { "YYYY-MM-DD": pointsBruts }

  function ensure(uid) {
    if (!standings[uid]) standings[uid] = { points: 0, wins: 0, losses: 0, matches: 0, pointsCumules: 0 };
  }

  function bump(uid, won, dateStr) {
    ensure(uid);
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

  // Points gagnés en Événement (tournoi), mêmes règles/points que le Duel du
  // jour (victoire = WIN_POINTS, défaite = LOSS_POINTS) et rattachés au même
  // plafond quotidien dayPoints (bump() ci-dessus) — un joueur qui joue un
  // duel ET un match d'événement le même jour reste plafonné à
  // MAX_POINTS_PER_DAY pour la journée, tous types de matchs confondus.
  // N'alimente en revanche jamais les "points cumulés" (bumpPointsCumules) :
  // ce départage est propre aux duels (condition de victoire du jeu), sans
  // équivalent naturel pour un match d'événement façon suisse.
  (eventMatches || []).forEach((m) => {
    if (m.status !== "termine" || !m.resolvedAt) return;
    const dateStr = localDateStr(toDate(m.resolvedAt));
    if (dateStr < season.startDate || dateStr > season.endDate) return;
    const winnerUid = eventMatchWinnerUid(m);
    if (!winnerUid) return;
    if (m.isBye) {
      bump(m.player1Uid, true, dateStr);
    } else {
      bump(m.player1Uid, winnerUid === m.player1Uid, dateStr);
      bump(m.player2Uid, winnerUid === m.player2Uid, dateStr);
    }
  });

  // Ajustements manuels de points par l'organisateur, rattachés à CETTE
  // saison au moment où ils ont été accordés (voir addPointAdjustment) — pas
  // plafonnés par jour (le plafond ne s'applique qu'aux points gagnés via un
  // duel), et ne comptent ni dans les matchs/victoires/défaites ni dans les
  // points cumulés (qui restent, eux, strictement dérivés des duels joués).
  // Un joueur qui n'a encore joué aucun duel cette saison mais a reçu un
  // bonus manuel apparaît quand même dans le classement, à 0 match.
  const seasonAdjustments = {};
  (adjustments || []).forEach((a) => {
    if (a.seasonId !== season.id) return;
    ensure(a.uid);
    seasonAdjustments[a.uid] = (seasonAdjustments[a.uid] || 0) + (Number(a.amount) || 0);
  });

  Object.keys(standings).forEach((uid) => {
    const capped = Object.values(dayPoints[uid] || {}).reduce((sum, raw) => sum + Math.min(raw, MAX_POINTS_PER_DAY), 0);
    standings[uid].points = capped + (seasonAdjustments[uid] || 0);
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

// Ajoute, DANS le même dayPoints (uid déjà connu, un seul joueur) que les
// duels, les points gagnés par ce joueur via des matchs d'Événement de cette
// saison — mutation en place plutôt qu'un retour séparé, pour que le
// plafond MAX_POINTS_PER_DAY (appliqué une seule fois au moment du reduce,
// voir les 2 fonctions ci-dessous) reste bien COMBINÉ duel + événement par
// journée, comme dans computeSeasonStandings. Retourne au passage
// victoires/défaites d'événement, pour seasonStatsForUid.
function addEventMatchDayPointsForUid(eventMatches, season, uid, dayPoints) {
  let wins = 0;
  let losses = 0;
  (eventMatches || []).forEach((m) => {
    if (m.status !== "termine" || !m.resolvedAt) return;
    const dateStr = localDateStr(toDate(m.resolvedAt));
    if (dateStr < season.startDate || dateStr > season.endDate) return;
    let won;
    if (m.isBye) {
      if (m.player1Uid !== uid) return;
      won = true;
    } else if (m.player1Uid === uid || m.player2Uid === uid) {
      won = eventMatchWinnerUid(m) === uid;
    } else {
      return;
    }
    if (won) wins += 1;
    else losses += 1;
    dayPoints[dateStr] = (dayPoints[dateStr] || 0) + (won ? WIN_POINTS : LOSS_POINTS);
  });
  return { wins, losses };
}

// Points gagnés par UN joueur sur UNE saison donnée (même calcul que
// computeSeasonStandings, mais pour un seul uid — réutilisé à la fois pour
// le total "à vie" (somme sur toutes les saisons) et pour le sous-total de
// la saison active).
function seasonPointsForUid(duels, season, uid, adjustments = [], eventMatches = []) {
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
  addEventMatchDayPointsForUid(eventMatches, season, uid, dayPoints);
  const duelPoints = Object.values(dayPoints).reduce((sum, raw) => sum + Math.min(raw, MAX_POINTS_PER_DAY), 0);
  const adjPoints = (adjustments || [])
    .filter((a) => a.uid === uid && a.seasonId === season.id)
    .reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
  return duelPoints + adjPoints;
}

// Points ET victoires/défaites d'UN joueur sur UNE saison donnée — variante
// de seasonPointsForUid ci-dessus qui garde aussi le décompte victoires/
// défaites (jamais plafonné, contrairement aux points). Utilisée uniquement
// pour la saison ACTIVE (voir computeCareerStats) : les saisons passées
// n'ont besoin que du sous-total de points pour le total "à vie".
function seasonStatsForUid(duels, season, uid, adjustments = [], eventMatches = []) {
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
  const eventStats = addEventMatchDayPointsForUid(eventMatches, season, uid, dayPoints);
  wins += eventStats.wins;
  losses += eventStats.losses;
  const duelPoints = Object.values(dayPoints).reduce((sum, raw) => sum + Math.min(raw, MAX_POINTS_PER_DAY), 0);
  const adjPoints = (adjustments || [])
    .filter((a) => a.uid === uid && a.seasonId === season.id)
    .reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
  return { points: duelPoints + adjPoints, wins, losses };
}

export function computeCareerStats(duels, seasons, uid, adjustments = [], eventMatches = []) {
  // Les victoires/défaites "à vie" restent volontairement scopées aux duels
  // du jour uniquement (voir le commentaire au-dessus de cette section) —
  // contrairement aux points (lifetimePoints ci-dessous), qui eux comptent
  // aussi les points gagnés en Événement pour rester cohérents avec l'écran
  // Saison (voir computeSeasonStandings).
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

  const seasonsPoints = (seasons || []).reduce(
    (sum, s) => sum + seasonPointsForUid(duels, s, uid, adjustments, eventMatches),
    0
  );
  // Un ajustement manuel compte TOUJOURS dans le total à vie, même ceux
  // accordés hors de toute saison active (seasonId=null, ou saison depuis
  // supprimée) — contrairement à un duel joué hors saison, qui ne rapporte
  // aucun point à vie (règle volontaire) : un bonus donné explicitement par
  // l'organisateur, lui, doit toujours se retrouver dans le total du joueur.
  // (Les ajustements rattachés à une saison existante sont déjà comptés
  // ci-dessus via seasonPointsForUid — on ne les rajoute pas une 2e fois.)
  const adjustmentsOutsideSeason = (adjustments || [])
    .filter((a) => a.uid === uid && !(seasons || []).some((s) => s.id === a.seasonId))
    .reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
  const lifetimePoints = seasonsPoints + adjustmentsOutsideSeason;

  const active = getActiveSeason(seasons || []);
  const currentSeason = active
    ? seasonStatsForUid(duels, active, uid, adjustments, eventMatches)
    : { points: 0, wins: 0, losses: 0 };

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
  const [duelsSnap, seasonsSnap, adjustmentsSnap, eventsSnap] = await Promise.all([
    getDocs(duelsCol),
    getDocs(seasonsCol),
    getDocs(pointAdjustmentsCol),
    getDocs(eventsCol),
  ]);
  const duels = duelsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const seasonsList = seasonsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const adjustmentsList = adjustmentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  // Fan-out à la demande (pas de collectionGroup, voir le commentaire de
  // startEventMatchesListening) : un getDocs par événement, une seule fois.
  const matchesSnaps = await Promise.all(
    eventsSnap.docs.map((e) => getDocs(collection(db, "events", e.id, "matches")))
  );
  const eventMatchesList = matchesSnaps.flatMap((s) => s.docs.map((d) => ({ id: d.id, ...d.data() })));
  return computeCareerStats(duels, seasonsList, uid, adjustmentsList, eventMatchesList);
}

// Historique des ajustements manuels d'UN joueur précis, du plus récent au
// plus ancien — utilisé par le panneau organisateur "Gérer ce joueur"
// (settings.js) pour afficher/permettre de supprimer les bonus déjà
// accordés à ce joueur.
export async function fetchAdjustmentsForUid(uid) {
  const snap = await getDocs(pointAdjustmentsCol);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((a) => a.uid === uid)
    .sort((a, b) => toDate(b.createdAt) - toDate(a.createdAt));
}

// ---------------------------------------------------------------------------
// État local
// ---------------------------------------------------------------------------
let seasons = []; // toutes les saisons (passées/actuelle/futures)
let duels = [];
let usersAll = [];
let adjustments = []; // tous les ajustements manuels de points (heavy listening, écran Saison)
let bannerListening = false;
let bannerUnsub = null;
let heavyListening = false;
let heavyUnsubs = [];
let grantAttemptedFor = null; // id de saison pour laquelle on a déjà tenté l'auto-attribution du tag cette session

// ---------------------------------------------------------------------------
// Écoute PARTAGÉE des matchs de TOUS les événements (actifs et terminés),
// pour les points gagnés en Événement dans les saisons (voir
// computeSeasonStandings/computeCareerStats plus haut). Utilisée à la fois
// par l'écran Saison (classement complet, startHeavyListening) et par les
// stats "carrière" de l'accueil (mon propre total, startCareerStatsListener)
// — un seul jeu d'écouteurs partagé (compteur de référence) plutôt qu'un par
// consommateur, pour ne pas dupliquer les lectures Firestore.
//
// Fan-out par événement (un onSnapshot sur /events, puis un onSnapshot par
// événement sur sa sous-collection /matches) plutôt qu'une requête
// collectionGroup — le mock de test ne supporte pas collectionGroup, et ça
// évite toute question sur la couverture des règles Firestore pour une
// requête inter-documents. Le nombre d'événements d'une boutique reste de
// toute façon modeste (quelques dizaines/centaines), donc ce fan-out reste
// largement raisonnable.
let eventMatchesByEventId = {}; // eventId -> [{...match}]
let eventMatchUnsubs = {}; // eventId -> fonction de désabonnement
let unsubEventsForMatches = null;
let eventMatchesRefCount = 0;
let eventMatches = []; // à plat, tous événements confondus — recalculé à chaque changement

function recomputeEventMatchesFlat() {
  eventMatches = Object.values(eventMatchesByEventId).flat();
}

function startEventMatchesListening() {
  eventMatchesRefCount += 1;
  if (unsubEventsForMatches) return; // déjà démarré par un autre consommateur
  unsubEventsForMatches = onSnapshot(eventsCol, (snap) => {
    const ids = snap.docs.map((d) => d.id);
    // Détache les écouteurs des événements qui ont disparu (supprimés),
    // attache ceux des événements nouvellement vus — jamais de double
    // écoute sur un même eventId.
    Object.keys(eventMatchUnsubs).forEach((id) => {
      if (!ids.includes(id)) {
        eventMatchUnsubs[id]();
        delete eventMatchUnsubs[id];
        delete eventMatchesByEventId[id];
      }
    });
    ids.forEach((id) => {
      if (eventMatchUnsubs[id]) return;
      eventMatchUnsubs[id] = onSnapshot(collection(db, "events", id, "matches"), (msnap) => {
        eventMatchesByEventId[id] = msnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        recomputeEventMatchesFlat();
        render(); // no-op si l'écran Saison n'est pas ouvert (voir les guards $(...))
        renderCareerStats(); // no-op si aucune stat "accueil" n'est affichée
      });
    });
    recomputeEventMatchesFlat();
    render();
    renderCareerStats();
  });
}
function stopEventMatchesListening() {
  eventMatchesRefCount = Math.max(0, eventMatchesRefCount - 1);
  if (eventMatchesRefCount > 0) return; // un autre consommateur encore actif
  unsubEventsForMatches?.();
  unsubEventsForMatches = null;
  Object.values(eventMatchUnsubs).forEach((u) => u());
  eventMatchUnsubs = {};
  eventMatchesByEventId = {};
  eventMatches = [];
}

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
let careerAdjustments = [];
let careerListening = false;
let careerUnsub = null;
let careerAdjustmentsUnsub = null;

function renderCareerStats() {
  const uid = getCurrentUid();
  const elPoints = $("#stat-points");
  const elWins = $("#stat-wins");
  const elLosses = $("#stat-losses");
  const elSeason = $("#stat-season-points");
  if (!uid || (!elPoints && !elWins && !elLosses && !elSeason)) return;
  const stats = computeCareerStats(careerDuels, seasons, uid, careerAdjustments, eventMatches);
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
  careerAdjustmentsUnsub = onSnapshot(pointAdjustmentsCol, (snap) => {
    careerAdjustments = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderCareerStats();
  });
  startEventMatchesListening();
}
export function stopCareerStatsListener() {
  careerUnsub?.();
  careerUnsub = null;
  careerAdjustmentsUnsub?.();
  careerAdjustmentsUnsub = null;
  careerDuels = [];
  careerAdjustments = [];
  careerListening = false;
  stopEventMatchesListening();
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
// Points bonus manuels — l'organisateur peut créditer (ou retirer, montant
// négatif) des points à un joueur, en dehors de tout duel. Rattaché à la
// saison active AU MOMENT de l'ajout (seasonId=null si aucune saison n'est
// active à cet instant) : voir computeCareerStats/computeSeasonStandings
// pour comment cet id est ensuite utilisé pour le total à vie et le
// classement de saison. Jamais plafonné par MAX_POINTS_PER_DAY (ce plafond
// ne s'applique qu'aux points gagnés via un duel du jour).
// ---------------------------------------------------------------------------
export async function addPointAdjustment(uid, amount, reason) {
  const active = getActiveSeason(seasons);
  await addDoc(pointAdjustmentsCol, {
    uid,
    amount,
    reason: reason || "",
    seasonId: active ? active.id : null,
    createdBy: getCurrentUid(),
    createdAt: serverTimestamp(),
  });
}

export async function deletePointAdjustment(adjustmentId) {
  await deleteDoc(doc(pointAdjustmentsCol, adjustmentId));
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
  const standings = computeSeasonStandings(duels, active, gameWinConditions, adjustments, eventMatches);
  const rows = buildLeaderboardRows(usersAll, standings);
  const myUid = getCurrentUid();
  const myIndex = rows.findIndex((r) => r.id === myUid);
  const mine = myIndex >= 0 ? rows[myIndex] : { points: 0, wins: 0, losses: 0, matches: 0, pointsCumules: 0 };
  const myRank = myIndex >= 0 ? myIndex + 1 : rows.length;

  maybeGrantSeasonTag(active, mine.matches);

  let html = `
    <h3>🏅 Saison ${active.seasonNumber}</h3>
    <p class="settings-note">Du ${formatFr(active.startDate)} au ${formatFr(active.endDate)} — points gagnés via le Duel du jour ET les Événements (victoire = ${WIN_POINTS} pts, défaite = ${LOSS_POINTS} pt, ${MAX_POINTS_PER_DAY} pts max par journée, duels et événements confondus).</p>
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
  heavyUnsubs.push(
    onSnapshot(pointAdjustmentsCol, (snap) => {
      adjustments = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      render();
    })
  );
  startEventMatchesListening();
}
function stopHeavyListening() {
  heavyUnsubs.forEach((u) => u());
  heavyUnsubs = [];
  heavyListening = false;
  duels = [];
  usersAll = [];
  adjustments = [];
  stopEventMatchesListening();
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
