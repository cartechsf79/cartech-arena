// ============================================================================
// Car'Tech Arena — Système de succès (achievements).
// ----------------------------------------------------------------------------
// 24 familles de succès (8 "historiques" + 16 imaginées ensuite), chacune
// avec 1, 3, 4 ou 5 paliers. Chaque palier rapporte un TAG ; le DERNIER
// palier de chaque famille rapporte EN PLUS un TITRE (voir la discussion
// d'origine : "les succès donnent des tags, et le dernier palier donne aussi
// un titre").
//
// Pas de Cloud Functions possible (Firebase Spark) : la détection ET
// l'attribution se font 100% côté client, exactement comme le tag de saison
// auto-attribué (season.js/maybeGrantSeasonTag) ou la récompense de
// parrainage (daily-duel.js/maybeGrantReferralReward) — le client calcule la
// condition à partir de données déjà accessibles, puis s'auto-écrit le
// tag/titre correspondant ; firestore.rules ne vérifie QUE la structure de
// l'écriture (un seul id "ach_tag_…"/"ach_title_…" ajouté à la fois), jamais
// la condition elle-même. Comme pour les scores de duel auto-déclarés, on
// fait donc confiance au client — c'est le même niveau de confiance que le
// reste de l'appli sur ce plan Firebase gratuit.
//
// Les définitions de tags/titres de succès ne sont PAS des documents
// Firestore (pas de seed, rien à publier/dépublier) : elles vivent
// uniquement ici, et sont fusionnées avec le catalogue "live" (tags/titres
// créés par l'organisateur) dans live-catalog.js — voir getAllTags/
// findAnyTag/getAllTitles/findAnyTitle là-bas. Elles n'apparaissent donc
// jamais dans les listes de gestion de l'organisateur (impossible à
// publier/supprimer, ce ne sont pas de "vrais" tags/titres créés à la main).
// ============================================================================
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  updateDoc,
  arrayUnion,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import { db } from "./firebase-init.js";
import { $, getCurrentProfile, getCurrentUid, hideAllViews, renderProfile, showToast } from "./app.js";
import { getAllGames, getGameWinCondition } from "./live-catalog.js";
import {
  toDate,
  localDateStr,
  computeCareerStats,
  computeSeasonStandings,
  buildGameWinConditionsMap,
} from "./season.js";

const duelsCol = collection(db, "dailySession", "current", "duels");
const seasonsCol = collection(db, "seasons");
const adjustmentsCol = collection(db, "pointAdjustments");
const eventsCol = collection(db, "events");

// ---------------------------------------------------------------------------
// Catalogue — 24 familles de succès
// ---------------------------------------------------------------------------
// defineFamily() génère automatiquement les ids de tags/titres (espace de
// noms réservé "ach_tag_"/"ach_title_", voir firestore.rules) à partir de la
// clé de la famille, pour ne jamais avoir à les recopier à la main.
let familyColorIndex = 0;
function nextFamilyColor() {
  const hue = Math.round((familyColorIndex++ * 137.508) % 360); // nombre d'or : bonne répartition des teintes
  return `hsl(${hue}, 62%, 52%)`;
}

function defineFamily(key, name, icon, description, statKey, tierList) {
  const color = nextFamilyColor();
  const tiers = tierList.map((t, i) => {
    const tier = {
      n: i + 1,
      threshold: t.threshold,
      tagId: `ach_tag_${key}_${i + 1}`,
      tagEmoji: t.tagEmoji,
      tagName: t.tagName,
      color,
    };
    if (i === tierList.length - 1) {
      tier.titleId = `ach_title_${key}`;
      tier.titleEmoji = t.titleEmoji || t.tagEmoji;
      tier.titleName = t.titleName || t.tagName;
    }
    return tier;
  });
  return { key, name, icon, description, statKey, tiers };
}

export const ACHIEVEMENTS = [
  // ------------------------------------------------------------------ 8 historiques
  defineFamily("duels_joues", "Duels joués", "⚔️", "Nombre total de Duels du jour joués (et validés).", "totalDuels", [
    { threshold: 1, tagEmoji: "🐣", tagName: "Premier duel" },
    { threshold: 50, tagEmoji: "🧭", tagName: "Je prends mes marques" },
    { threshold: 200, tagEmoji: "👀", tagName: "Attention à toi" },
    { threshold: 500, tagEmoji: "😬", tagName: "Vaut mieux pas te chercher" },
    { threshold: 1000, tagEmoji: "🏛️", tagName: "Vétéran de l'Arène", titleName: "Vétéran de l'Arène" },
  ]),
  defineFamily("victoires_affilee", "Victoires d'affilée", "🔥", "Le plus grand nombre de victoires enchaînées d'affilée.", "bestWinStreak", [
    { threshold: 2, tagEmoji: "🔥", tagName: "Échauffement" },
    { threshold: 5, tagEmoji: "🌶️", tagName: "Bouillant" },
    { threshold: 10, tagEmoji: "🔥🔥", tagName: "Chaud comme la braise" },
    { threshold: 25, tagEmoji: "☄️", tagName: "EN FEUUUU", titleName: "EN FEUUUU" },
  ]),
  defineFamily("participation_evenements", "Participation aux Événements", "🙋", "Nombre d'Événements auxquels tu as participé.", "participationCount", [
    { threshold: 1, tagEmoji: "🙋", tagName: "Je suis là" },
    { threshold: 5, tagEmoji: "🚀", tagName: "C'est parti" },
    { threshold: 20, tagEmoji: "🎫", tagName: "J'ai l'habitude" },
    { threshold: 50, tagEmoji: "🔁", tagName: "Encore un tour", titleName: "Encore un tour" },
  ]),
  defineFamily("duels_lorcana", "Duels Lorcana", "🔮", "Duels du jour joués sur Lorcana.", "lorcanaDuels", [
    { threshold: 10, tagEmoji: "❓", tagName: "C'est ça Lorcana ?" },
    { threshold: 50, tagEmoji: "📖", tagName: "Je connais les règles" },
    { threshold: 200, tagEmoji: "🧬", tagName: "Lorcana dans mes gènes", titleName: "Lorcana dans mes gènes" },
  ]),
  defineFamily("duels_pokemon", "Duels Pokémon", "⚡", "Duels du jour joués sur Pokémon TCG.", "pokemonDuels", [
    { threshold: 10, tagEmoji: "❓", tagName: "C'est ça Pokémon ?" },
    { threshold: 50, tagEmoji: "📖", tagName: "Je connais les règles" },
    { threshold: 200, tagEmoji: "🧬", tagName: "Pokémon dans les gènes", titleName: "Pokémon dans les gènes" },
  ]),
  defineFamily("perfects", "Perfects", "🎯", "Duels gagnés en laissant l'adversaire à 0.", "perfects", [
    { threshold: 1, tagEmoji: "🎯", tagName: "Headshot" },
    { threshold: 3, tagEmoji: "💥", tagName: "Triple Kill" },
    { threshold: 6, tagEmoji: "☠️", tagName: "Overkill" },
    { threshold: 15, tagEmoji: "👹", tagName: "MONSTER KILL", titleName: "MONSTER KILL" },
  ]),
  defineFamily("comeback_1pv", "Comeback à 1 point de vie", "🩹", "Duels gagnés avec 1 seul point de vie restant (jeux à condition de victoire \"point de vie\").", "comebacks", [
    { threshold: 1, tagEmoji: "😰", tagName: "Ça passe crème" },
    { threshold: 5, tagEmoji: "🩹", tagName: "Miraculé" },
    { threshold: 10, tagEmoji: "🎭", tagName: "Remontada", titleName: "Remontada" },
  ]),
  defineFamily("score_max_duel_jour", "Score max Duel du jour", "👑", "Duels gagnés en faisant le score maximum possible.", "maxScoreWins", [
    { threshold: 1, tagEmoji: "🥉", tagName: "Prince de la journée" },
    { threshold: 10, tagEmoji: "🥈", tagName: "Duc de la journée" },
    { threshold: 25, tagEmoji: "🥇", tagName: "Roi de la journée" },
    { threshold: 50, tagEmoji: "👑", tagName: "Empereur de la journée", titleName: "Empereur de la journée" },
  ]),

  // ------------------------------------------------------------------ 16 imaginés — 5 paliers
  defineFamily("assiduite", "Assiduité", "📅", "Nombre de jours différents où tu as joué le Duel du jour.", "assiduiteDays", [
    { threshold: 3, tagEmoji: "📅", tagName: "Premier passage" },
    { threshold: 10, tagEmoji: "🗓️", tagName: "Habitué" },
    { threshold: 30, tagEmoji: "🔑", tagName: "Un pied dans la boutique" },
    { threshold: 75, tagEmoji: "🛋️", tagName: "Deuxième maison" },
    { threshold: 150, tagEmoji: "🏠", tagName: "Résident permanent", titleName: "Ici c'est chez moi" },
  ]),
  defineFamily("polyvalent", "Polyvalent", "🌈", "Duels joués dans CHAQUE jeu proposé par la boutique (le jeu le moins joué compte).", "minGameCount", [
    { threshold: 5, tagEmoji: "🎲", tagName: "Touche-à-tout" },
    { threshold: 15, tagEmoji: "🎯", tagName: "Je m'y retrouve" },
    { threshold: 30, tagEmoji: "🧩", tagName: "Multi-jeux confirmé" },
    { threshold: 60, tagEmoji: "🎓", tagName: "Maître en tout" },
    { threshold: 100, tagEmoji: "🌈", tagName: "Polyvalent", titleName: "L'as de tous les jeux" },
  ]),
  defineFamily("parrain_serie", "Parrain en série", "🌳", "Nombre de filleuls parrainés.", "referralCount", [
    { threshold: 1, tagEmoji: "🌱", tagName: "Premier filleul" },
    { threshold: 3, tagEmoji: "🌿", tagName: "Petit réseau" },
    { threshold: 8, tagEmoji: "🌳", tagName: "Recruteur" },
    { threshold: 15, tagEmoji: "🌲", tagName: "Ambassadeur" },
    { threshold: 25, tagEmoji: "🌳", tagName: "Parrain légendaire", titleName: "Tête de réseau" },
  ]),
  defineFamily("collectionneur", "Collectionneur", "🗃️", "Nombre de tags différents possédés.", "tagsOwnedCount", [
    { threshold: 5, tagEmoji: "🏷️", tagName: "Petite collection" },
    { threshold: 10, tagEmoji: "🎫", tagName: "Ça s'accumule" },
    { threshold: 25, tagEmoji: "📦", tagName: "Belle collection" },
    { threshold: 50, tagEmoji: "🗂️", tagName: "Amateur éclairé" },
    { threshold: 75, tagEmoji: "🗃️", tagName: "Collectionneur", titleName: "Collectionneur" },
  ]),
  defineFamily("fidele_deck", "Fidèle à un deck", "🃏", "Duels joués avec le même élément/archétype de deck.", "maxDeckLoyalty", [
    { threshold: 3, tagEmoji: "🃏", tagName: "Premier attachement" },
    { threshold: 8, tagEmoji: "🔖", tagName: "Fidèle" },
    { threshold: 15, tagEmoji: "🎴", tagName: "Loyaliste" },
    { threshold: 25, tagEmoji: "🧷", tagName: "Indéfectible" },
    { threshold: 40, tagEmoji: "🃏", tagName: "Signature", titleName: "Signature" },
  ]),
  defineFamily("rival", "Rival", "🤝", "Nombre d'adversaires différents affrontés.", "distinctOpponents", [
    { threshold: 2, tagEmoji: "👋", tagName: "Premiers adversaires" },
    { threshold: 5, tagEmoji: "🤺", tagName: "Ça varie" },
    { threshold: 10, tagEmoji: "🎭", tagName: "Beaucoup de têtes différentes" },
    { threshold: 15, tagEmoji: "🌐", tagName: "Presque tout le monde" },
    { threshold: 25, tagEmoji: "🤝", tagName: "Je connais tout le monde", titleName: "Je connais tout le monde" },
  ]),
  defineFamily("rivalite", "Rivalité", "🥊", "Duels rejoués contre le même adversaire.", "maxSameOpponent", [
    { threshold: 3, tagEmoji: "🥊", tagName: "On se recroise" },
    { threshold: 5, tagEmoji: "⚔️", tagName: "Rivalité" },
    { threshold: 10, tagEmoji: "🎯", tagName: "Ennemi juré" },
    { threshold: 20, tagEmoji: "🔥", tagName: "Grand rival" },
    { threshold: 40, tagEmoji: "🏛️", tagName: "Nemesis", titleEmoji: "⚔️", titleName: "Ma Nemesis" },
  ]),
  defineFamily("points_a_vie", "Points à vie", "💯", "Total de points accumulés depuis toujours.", "lifetimePoints", [
    { threshold: 50, tagEmoji: "🔰", tagName: "Débutant" },
    { threshold: 100, tagEmoji: "🥉", tagName: "Novice" },
    { threshold: 500, tagEmoji: "🥈", tagName: "Confirmé" },
    { threshold: 1000, tagEmoji: "🥇", tagName: "Légende" },
    { threshold: 2500, tagEmoji: "👑", tagName: "Immortel", titleName: "Légende Immortelle" },
  ]),
  defineFamily("ancien_maison", "Ancien de la maison", "🏛️", "Ancienneté du compte.", "accountAgeMonths", [
    { threshold: 1, tagEmoji: "🌤️", tagName: "Petit nouveau" },
    { threshold: 3, tagEmoji: "📆", tagName: "Ça commence à dater" },
    { threshold: 6, tagEmoji: "🗓️", tagName: "Habitué de longue date" },
    { threshold: 12, tagEmoji: "🎂", tagName: "Un an déjà !" },
    { threshold: 24, tagEmoji: "🏛️", tagName: "Pilier de la boutique", titleName: "Ancien de la maison" },
  ]),

  // ------------------------------------------------------------------ 16 imaginés — 4 paliers
  defineFamily("champion_tournoi", "Champion de tournoi", "🏆", "Nombre d'Événements remportés (1ère place).", "championCount", [
    { threshold: 1, tagEmoji: "🏆", tagName: "Premier titre" },
    { threshold: 3, tagEmoji: "🏆🏆", tagName: "Multiple champion" },
    { threshold: 8, tagEmoji: "👑", tagName: "Habitué du trophée" },
    { threshold: 15, tagEmoji: "⚜️", tagName: "Grand Champion", titleName: "Grand Champion" },
  ]),
  defineFamily("sur_le_podium", "Sur le podium", "🥇", "Nombre de fois dans le top 3 en fin de saison.", "seasonPodiumCount", [
    { threshold: 1, tagEmoji: "🥉", tagName: "Sur le podium" },
    { threshold: 5, tagEmoji: "🏅", tagName: "Un habitué du podium" },
    { threshold: 10, tagEmoji: "🎖️", tagName: "Toujours devant" },
    { threshold: 25, tagEmoji: "🏆", tagName: "Machine à podiums", titleName: "Increvable" },
  ]),
  defineFamily("comeback_kid", "Come-back kid", "🎭", "Perdre sa 1ère manche dans un tournoi à la suisse mais finir quand même sur le podium.", "comebackKidCount", [
    { threshold: 1, tagEmoji: "🔄", tagName: "Ça arrive" },
    { threshold: 3, tagEmoji: "💪", tagName: "Come-back kid" },
    { threshold: 5, tagEmoji: "🎢", tagName: "Spécialiste du rebond" },
    { threshold: 10, tagEmoji: "🦾", tagName: "Increvable", titleEmoji: "🎭", titleName: "Le roi du comeback" },
  ]),
  defineFamily("david_goliath", "David contre Goliath", "🪨", "Battre un adversaire qui a plus de victoires à vie que toi.", "davidGoliathCount", [
    { threshold: 1, tagEmoji: "🪃", tagName: "David contre Goliath" },
    { threshold: 3, tagEmoji: "🗡️", tagName: "Chasseur de gros gibier" },
    { threshold: 5, tagEmoji: "🦁", tagName: "Tueur de favoris" },
    { threshold: 10, tagEmoji: "🪨", tagName: "Fléau des favoris", titleName: "David contre Goliath" },
  ]),
  defineFamily("la_poisse", "La poisse", "🐌", "Le plus grand nombre de défaites enchaînées d'affilée.", "bestLossStreak", [
    { threshold: 3, tagEmoji: "😅", tagName: "Petite série noire" },
    { threshold: 5, tagEmoji: "😩", tagName: "La poisse" },
    { threshold: 8, tagEmoji: "🌧️", tagName: "Les jours se suivent…" },
    { threshold: 12, tagEmoji: "🐌", tagName: "Traversée du désert", titleName: "La poisse ultime" },
  ]),

  // ------------------------------------------------------------------ 16 imaginés — 1 palier
  defineFamily("champion_saison", "Champion de saison", "👑", "Terminer 1er au classement final d'une saison.", "seasonChampionCount", [
    { threshold: 1, tagEmoji: "🥇", tagName: "Champion de saison", titleName: "Champion de saison" },
  ]),
  defineFamily("platine", "Platine", "💠", "Débloquer tous les autres succès.", "__platine__", [
    { threshold: 1, tagEmoji: "🏅", tagName: "Platine", titleName: "Platine" },
  ]),
];

// ---------------------------------------------------------------------------
// Fusion avec le catalogue live (tags/titres) — voir live-catalog.js
// ---------------------------------------------------------------------------
export function getAchievementTagDefs() {
  const defs = [];
  ACHIEVEMENTS.forEach((fam) => {
    fam.tiers.forEach((t) => {
      defs.push({
        id: t.tagId,
        name: t.tagName,
        emoji: t.tagEmoji,
        color: t.color,
        defaultOwned: false,
        referralReward: false,
        isAchievement: true,
        builtin: true,
      });
    });
  });
  return defs;
}
export function getAchievementTitleDefs() {
  return ACHIEVEMENTS.map((fam) => {
    const last = fam.tiers[fam.tiers.length - 1];
    return { id: last.titleId, name: last.titleName, published: false, isAchievement: true, builtin: true };
  });
}

// ---------------------------------------------------------------------------
// Calcul de progression — helpers purs
// ---------------------------------------------------------------------------
function buildFamilyProgress(fam, current) {
  let reachedIdx = -1;
  fam.tiers.forEach((t, i) => {
    if (current >= t.threshold) reachedIdx = i;
  });
  const next = reachedIdx + 1 < fam.tiers.length ? fam.tiers[reachedIdx + 1] : null;
  const prevThreshold = reachedIdx >= 0 ? fam.tiers[reachedIdx].threshold : 0;
  const percent = next
    ? Math.max(0, Math.min(100, Math.round(((current - prevThreshold) / (next.threshold - prevThreshold)) * 100)))
    : 100;
  return {
    key: fam.key,
    name: fam.name,
    icon: fam.icon,
    description: fam.description,
    tiers: fam.tiers,
    current,
    reachedIdx,
    next,
    percent,
  };
}

// Historique complet des duels du jour d'UN joueur, triés chronologiquement
// (par résolution) — sert de base à la quasi-totalité des succès basés sur
// les duels. `resolvedAt` n'est posé qu'une fois le duel "termine" (voir
// daily-duel.js), donc ce filtre suffit à ne garder que des duels validés.
function computeDuelBasedStats(duels, uid) {
  const mine = (duels || [])
    .filter((d) => d.status === "termine" && d.resultFrom && d.resultTo && (d.fromUid === uid || d.toUid === uid))
    .map((d) => {
      const isFrom = d.fromUid === uid;
      const myResult = isFrom ? d.resultFrom : d.resultTo;
      const oppUid = isFrom ? d.toUid : d.fromUid;
      return {
        id: d.id,
        game: d.game,
        iWon: !!myResult.iWon,
        myScore: Number(myResult.myScore),
        oppScore: Number(myResult.oppScore),
        oppUid,
        resolvedAt: d.resolvedAt,
      };
    })
    .sort((a, b) => (toDate(a.resolvedAt)?.getTime() || 0) - (toDate(b.resolvedAt)?.getTime() || 0));

  const perGameCount = {};
  let bestWinStreak = 0,
    bestLossStreak = 0,
    curWin = 0,
    curLoss = 0;
  let perfects = 0,
    comebacks = 0,
    maxScoreWins = 0;
  const distinctDays = new Set();
  const oppCounts = {};

  mine.forEach((d) => {
    perGameCount[d.game] = (perGameCount[d.game] || 0) + 1;
    if (d.iWon) {
      curWin += 1;
      curLoss = 0;
    } else {
      curLoss += 1;
      curWin = 0;
    }
    bestWinStreak = Math.max(bestWinStreak, curWin);
    bestLossStreak = Math.max(bestLossStreak, curLoss);
    if (d.iWon && d.oppScore === 0) perfects += 1;
    const wc = getGameWinCondition(d.game);
    if (d.iWon && wc && wc.value > 0) {
      if (wc.type === "point_defaite" && d.myScore === 1) comebacks += 1;
      if (d.myScore === wc.value) maxScoreWins += 1;
    }
    if (d.resolvedAt) distinctDays.add(localDateStr(toDate(d.resolvedAt)));
    oppCounts[d.oppUid] = (oppCounts[d.oppUid] || 0) + 1;
  });

  const distinctOpponents = Object.keys(oppCounts).length;
  const maxSameOpponent = Object.values(oppCounts).reduce((m, v) => Math.max(m, v), 0);

  return {
    mine,
    totalDuels: mine.length,
    perGameCount,
    bestWinStreak,
    bestLossStreak,
    perfects,
    comebacks,
    maxScoreWins,
    assiduiteDays: distinctDays.size,
    distinctOpponents,
    maxSameOpponent,
  };
}

// "Fidèle à un deck" : regroupe les duels du joueur par signature d'éléments
// de deck déclarés (dailySession/current/duels/{id}/decks/{uid}) et renvoie
// la taille du plus gros groupe. Une lecture par duel — acceptable à
// l'échelle d'une boutique, jamais fait qu'à l'ouverture de l'écran Succès.
async function computeDeckLoyalty(uid, duelIds) {
  const results = await Promise.all(
    duelIds.map(async (id) => {
      try {
        const snap = await getDoc(doc(db, "dailySession", "current", "duels", id, "decks", uid));
        if (!snap.exists()) return null;
        const elements = snap.data().elements || [];
        if (!elements.length) return null;
        return elements.slice().sort().join("|");
      } catch {
        return null;
      }
    })
  );
  const counts = {};
  results.filter(Boolean).forEach((sig) => {
    counts[sig] = (counts[sig] || 0) + 1;
  });
  return Object.values(counts).reduce((m, v) => Math.max(m, v), 0);
}

async function fetchReferralCount(uid) {
  const snap = await getDocs(query(collection(db, "users"), where("referral.referredByUid", "==", uid)));
  return snap.size;
}

function computeAccountAgeMonths(profile) {
  const created = profile?.createdAt;
  if (!created) return 0;
  const createdDate = toDate(created);
  if (!createdDate) return 0;
  const diffMs = Date.now() - createdDate.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30.44)));
}

// Vainqueur d'un match d'Événement — même logique que matchWinnerUid()
// (event.js) / eventMatchWinnerUid() (season.js), non exportées là-bas.
function eventMatchWinnerUid(m) {
  if (m.status !== "termine") return null;
  if (m.isBye) return m.player1Uid;
  const wins1 = (m.gamesResult1 || []).filter((g) => g.iWon).length;
  const wins2 = (m.gamesResult1 || []).length - wins1;
  return wins1 > wins2 ? m.player1Uid : m.player2Uid;
}

// "Sur le podium" / "Champion de saison" : aucun classement de saison n'est
// jamais persisté (voir season.js, tout est recalculé à la volée) — on
// recalcule donc le classement de CHAQUE saison déjà terminée (endDate dans
// le passé) et on regarde le rang du joueur, avec le même tri que
// buildLeaderboardRows() (season.js).
function computeSeasonRanks(duels, seasons, adjustments, eventMatches, uid) {
  const wcMap = buildGameWinConditionsMap();
  const today = localDateStr();
  let podiumCount = 0,
    championCount = 0;
  (seasons || []).forEach((season) => {
    if (!season.endDate || season.endDate >= today) return; // saison encore en cours : pas encore de classement définitif
    const standings = computeSeasonStandings(duels, season, wcMap, adjustments, eventMatches);
    const rows = Object.entries(standings).map(([id, s]) => ({ id, ...s }));
    if (!rows.length) return;
    rows.sort(
      (a, b) =>
        b.points - a.points || b.pointsCumules - a.pointsCumules || b.wins - a.wins || a.matches - b.matches
    );
    const idx = rows.findIndex((r) => r.id === uid);
    if (idx === -1) return;
    const rank = idx + 1;
    if (rank <= 3) podiumCount += 1;
    if (rank === 1) championCount += 1;
  });
  return { podiumCount, championCount };
}

// "David contre Goliath" : victoires (Duel du jour + Événement) contre un
// adversaire ayant, à l'instant du calcul, plus de victoires à vie (au sens
// de computeCareerStats — Duel du jour uniquement, comme partout ailleurs
// dans l'appli) que le joueur lui-même. Toutes les données nécessaires sont
// déjà en mémoire (aucune requête réseau supplémentaire) — un simple cache
// par adversaire évite de refaire le calcul plusieurs fois pour le même uid.
function computeDavidGoliath(duels, seasons, adjustments, eventMatches, uid) {
  const myWins = computeCareerStats(duels, seasons, uid, adjustments, eventMatches).lifetimeWins;
  const cache = new Map();
  function oppLifetimeWins(oppUid) {
    if (!cache.has(oppUid)) {
      cache.set(oppUid, computeCareerStats(duels, seasons, oppUid, adjustments, eventMatches).lifetimeWins);
    }
    return cache.get(oppUid);
  }
  let count = 0;
  (duels || []).forEach((d) => {
    if (d.status !== "termine" || !d.resultFrom || !d.resultTo) return;
    let won, oppUid;
    if (d.fromUid === uid) {
      won = d.resultFrom.iWon;
      oppUid = d.toUid;
    } else if (d.toUid === uid) {
      won = d.resultTo.iWon;
      oppUid = d.fromUid;
    } else return;
    if (won && oppLifetimeWins(oppUid) > myWins) count += 1;
  });
  (eventMatches || []).forEach((m) => {
    if (m.status !== "termine" || m.isBye) return;
    if (m.player1Uid !== uid && m.player2Uid !== uid) return;
    if (eventMatchWinnerUid(m) !== uid) return;
    const oppUid = m.player1Uid === uid ? m.player2Uid : m.player1Uid;
    if (oppLifetimeWins(oppUid) > myWins) count += 1;
  });
  return count;
}

// "Come-back kid" : uniquement en mode "tournoi à la suisse" — le joueur a
// perdu son (vrai, hors bye) match de la manche 1, mais a quand même fini
// dans le top 3 de l'Événement (participants/{uid}.placement, posé par
// finalizeEvent() dans event.js).
function computeComebackKid(eventMatches, myParticipation) {
  let count = 0;
  myParticipation.forEach(({ event, participant }) => {
    if (event.status !== "termine" || event.bracketMode !== "suisse") return;
    if (!participant || !(participant.placement >= 1 && participant.placement <= 3)) return;
    const round1 = (eventMatches || []).filter(
      (m) => m.eventId === event.id && m.round === 1 && !m.isBye && (m.player1Uid === participant.uid || m.player2Uid === participant.uid)
    );
    const lostRound1 = round1.some((m) => eventMatchWinnerUid(m) !== participant.uid);
    if (lostRound1) count += 1;
  });
  return count;
}

// ---------------------------------------------------------------------------
// Calcul complet de la progression d'un joueur sur les 24 succès. Fait
// plusieurs lectures Firestore en parallèle (comme fetchCareerStats dans
// season.js) — appelé à l'ouverture de l'écran Succès, et en tâche de fond
// (best-effort) juste après un duel/un match d'Événement validé.
// ---------------------------------------------------------------------------
export async function computeAchievementProgress(uid, profile) {
  const [duelsSnap, seasonsSnap, adjustmentsSnap, eventsSnap, referralCount] = await Promise.all([
    getDocs(duelsCol),
    getDocs(seasonsCol),
    getDocs(adjustmentsCol),
    getDocs(eventsCol),
    fetchReferralCount(uid),
  ]);
  const duels = duelsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const seasons = seasonsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const adjustments = adjustmentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const events = eventsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const [matchesSnaps, participantSnaps] = await Promise.all([
    Promise.all(events.map((e) => getDocs(collection(db, "events", e.id, "matches")))),
    Promise.all(events.map((e) => getDoc(doc(db, "events", e.id, "participants", uid)))),
  ]);
  const eventMatches = matchesSnaps.flatMap((s, i) => s.docs.map((d) => ({ id: d.id, eventId: events[i].id, ...d.data() })));
  const myParticipation = events.map((e, i) => ({
    event: e,
    participant: participantSnaps[i].exists() ? { uid, ...participantSnaps[i].data() } : null,
  }));

  const duelStats = computeDuelBasedStats(duels, uid);
  const maxDeckLoyalty = await computeDeckLoyalty(uid, duelStats.mine.map((d) => d.id));
  const career = computeCareerStats(duels, seasons, uid, adjustments, eventMatches);
  const { podiumCount: seasonPodiumCount, championCount: seasonChampionCount } = computeSeasonRanks(
    duels,
    seasons,
    adjustments,
    eventMatches,
    uid
  );
  const davidGoliathCount = computeDavidGoliath(duels, seasons, adjustments, eventMatches, uid);
  const comebackKidCount = computeComebackKid(eventMatches, myParticipation);
  const championCount = myParticipation.filter(
    ({ event, participant }) => event.status === "termine" && participant?.placement === 1
  ).length;
  const participationCount = myParticipation.filter(
    ({ event, participant }) => participant?.status === "inscrit" && event.status !== "inscription"
  ).length;
  const allGames = getAllGames();
  const minGameCount = allGames.length
    ? Math.min(...allGames.map((g) => duelStats.perGameCount[g] || 0))
    : 0;

  const stats = {
    totalDuels: duelStats.totalDuels,
    bestWinStreak: duelStats.bestWinStreak,
    bestLossStreak: duelStats.bestLossStreak,
    participationCount,
    lorcanaDuels: duelStats.perGameCount["Lorcana"] || 0,
    pokemonDuels: duelStats.perGameCount["Pokémon TCG"] || 0,
    perfects: duelStats.perfects,
    comebacks: duelStats.comebacks,
    maxScoreWins: duelStats.maxScoreWins,
    assiduiteDays: duelStats.assiduiteDays,
    minGameCount,
    referralCount,
    tagsOwnedCount: (profile?.tags?.owned || []).length,
    maxDeckLoyalty,
    distinctOpponents: duelStats.distinctOpponents,
    maxSameOpponent: duelStats.maxSameOpponent,
    lifetimePoints: career.lifetimePoints,
    accountAgeMonths: computeAccountAgeMonths(profile),
    championCount,
    seasonPodiumCount,
    comebackKidCount,
    davidGoliathCount,
    seasonChampionCount,
  };

  const families = ACHIEVEMENTS.filter((f) => f.key !== "platine").map((fam) => buildFamilyProgress(fam, stats[fam.statKey] || 0));
  const allOthersMaxed = families.every((f) => f.reachedIdx === f.tiers.length - 1);
  const platineFam = ACHIEVEMENTS.find((f) => f.key === "platine");
  families.push(buildFamilyProgress(platineFam, allOthersMaxed ? 1 : 0));

  return { families, stats };
}

// ---------------------------------------------------------------------------
// Attribution automatique — même esprit que maybeGrantReferralReward()
// (daily-duel.js) / maybeGrantSeasonTag() (season.js) : écriture "au mieux",
// une erreur de permission est juste avalée (purement cosmétique, jamais
// bloquant pour le joueur). Un tag/titre à la fois (voir firestore.rules).
// ---------------------------------------------------------------------------
async function grantNewlyEarned(uid, profile, progress) {
  const ownedTags = new Set(profile?.tags?.owned || []);
  const ownedTitles = new Set(profile?.title?.owned || []);
  const newTags = [];
  const newTitles = [];
  progress.families.forEach((fam) => {
    fam.tiers.forEach((t, i) => {
      if (i <= fam.reachedIdx && !ownedTags.has(t.tagId)) newTags.push(t);
    });
    if (fam.reachedIdx === fam.tiers.length - 1) {
      const last = fam.tiers[fam.tiers.length - 1];
      if (!ownedTitles.has(last.titleId)) newTitles.push(last);
    }
  });
  if (!newTags.length && !newTitles.length) return { newTags: [], newTitles: [] };

  const userRef = doc(db, "users", uid);
  for (const t of newTags) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await updateDoc(userRef, { "tags.owned": arrayUnion(t.tagId) });
    } catch (err) {
      console.error("Attribution du tag de succès échouée (pas grave, purement cosmétique) :", err);
    }
  }
  for (const t of newTitles) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await updateDoc(userRef, { "title.owned": arrayUnion(t.titleId) });
    } catch (err) {
      console.error("Attribution du titre de succès échouée (pas grave, purement cosmétique) :", err);
    }
  }
  // Pas de listener permanent sur son propre profil ailleurs dans l'appli
  // (getCurrentProfile() reste sinon périmé tant qu'on ne relit pas) — même
  // pattern que refreshAfterChange() dans settings.js après une écriture sur
  // soi-même, pour que le picker de titre/tags actifs voie tout de suite ce
  // qui vient d'être débloqué.
  try {
    const snap = await getDoc(userRef);
    if (snap.exists()) renderProfile(snap.data());
  } catch (err) {
    console.error(err);
  }
  return { newTags, newTitles };
}

let refreshInFlight = false;
// Point d'entrée unique : recalcule toute la progression et attribue les
// nouveaux tags/titres mérités. Appelé à l'ouverture de l'écran Succès, et
// en tâche de fond après un duel/un match d'Événement validé — protégé par
// un simple garde-fou pour ne jamais faire tourner deux calculs en même
// temps (comme handledFinishedDuelIds dans daily-duel.js).
export async function refreshAchievements(uid, profile, { silent = false } = {}) {
  if (!uid || !profile || refreshInFlight) return null;
  refreshInFlight = true;
  try {
    const progress = await computeAchievementProgress(uid, profile);
    const { newTags, newTitles } = await grantNewlyEarned(uid, profile, progress);
    if (!silent) {
      newTags.forEach((t) => showToast(`🏅 Succès débloqué : ${t.tagEmoji} ${t.tagName}`));
      newTitles.forEach((t) => showToast(`🎖️ Nouveau titre débloqué : ${t.titleEmoji} ${t.titleName} !`));
    }
    return progress;
  } catch (err) {
    console.error(err);
    return null;
  } finally {
    refreshInFlight = false;
  }
}

// ---------------------------------------------------------------------------
// Écran "Succès" — 24 cartes, palier atteint en évidence, barre de
// progression visible vers le prochain palier, titre affiché une fois
// débloqué.
// ---------------------------------------------------------------------------
function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function formatStatValue(n) {
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)).toLocaleString("fr-FR") : "0";
}

function familyCardHtml(fam) {
  const maxed = fam.reachedIdx === fam.tiers.length - 1;
  const reachedTier = fam.reachedIdx >= 0 ? fam.tiers[fam.reachedIdx] : null;
  const tiersHtml = fam.tiers
    .map((t, i) => {
      const reached = i <= fam.reachedIdx;
      return `
        <div class="ach-tier ${reached ? "ach-tier-reached" : "ach-tier-locked"}" title="${escapeHtml(t.tagName)} — palier ${t.n} (${formatStatValue(t.threshold)})">
          <span class="ach-tier-emoji">${reached ? t.tagEmoji : "🔒"}</span>
          <span class="ach-tier-threshold">${formatStatValue(t.threshold)}</span>
        </div>`;
    })
    .join("");

  const progressLabel = maxed
    ? "Complété !"
    : fam.next
    ? `${formatStatValue(fam.current)} / ${formatStatValue(fam.next.threshold)}`
    : `${formatStatValue(fam.current)}`;

  const titleBadge =
    maxed && fam.tiers[fam.tiers.length - 1].titleId
      ? `<div class="ach-title-earned">🎖️ Titre débloqué : <b>${fam.tiers[fam.tiers.length - 1].titleEmoji} ${escapeHtml(
          fam.tiers[fam.tiers.length - 1].titleName
        )}</b></div>`
      : "";

  return `
    <div class="card ach-card ${maxed ? "ach-card-maxed" : ""}">
      <div class="ach-card-header">
        <div class="ach-card-icon">${fam.icon}</div>
        <div class="ach-card-heading">
          <div class="ach-card-name">${escapeHtml(fam.name)}</div>
          <div class="ach-card-desc">${escapeHtml(fam.description)}</div>
        </div>
        <div class="ach-card-tier-badge">${reachedTier ? `${reachedTier.tagEmoji}` : "—"} <span>${fam.reachedIdx + 1}/${fam.tiers.length}</span></div>
      </div>
      <div class="ach-tiers-row">${tiersHtml}</div>
      <div class="ach-progress-wrap">
        <div class="ach-progress-bar"><div class="ach-progress-fill" style="width:${maxed ? 100 : fam.percent}%;"></div></div>
        <div class="ach-progress-label">${progressLabel}</div>
      </div>
      ${titleBadge}
    </div>`;
}

async function renderAchievementsScreen() {
  const container = $("#achievements-list");
  const summary = $("#achievements-summary");
  if (!container) return;
  container.innerHTML = `<p class="settings-note">Calcul de ta progression…</p>`;
  const uid = getCurrentUid();
  const profile = getCurrentProfile();
  const progress = await refreshAchievements(uid, profile);
  if (!progress) {
    container.innerHTML = `<p class="settings-note">Impossible de charger tes succès pour l'instant.</p>`;
    return;
  }
  const maxedCount = progress.families.filter((f) => f.reachedIdx === f.tiers.length - 1).length;
  if (summary) {
    summary.textContent = `${maxedCount} / ${progress.families.length} succès complétés`;
  }
  container.innerHTML = progress.families.map(familyCardHtml).join("");
}

export function showAchievementsScreen() {
  hideAllViews();
  $("#view-achievements")?.classList.add("active");
  renderAchievementsScreen();
}
function closeAchievementsScreen() {
  hideAllViews();
  $("#view-app")?.classList.add("active");
}

document.addEventListener("DOMContentLoaded", () => {
  $("#btn-open-achievements")?.addEventListener("click", showAchievementsScreen);
  $("#btn-close-achievements")?.addEventListener("click", closeAchievementsScreen);
});
