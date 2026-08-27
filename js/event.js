// ============================================================================
// Car'Tech Arena — "Événement" (tournoi façon suisse)
// Inscriptions validées par l'organisateur, appariements aléatoires par
// manche (regroupés par nombre de victoires), résultats validés en double
// comme le Duel du jour, classement final avec place de chacun.
// ============================================================================
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  collection,
  getDocs,
  onSnapshot,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import { db } from "./firebase-init.js";
import {
  $,
  getCurrentProfile,
  getCurrentUid,
  showToast,
  friendlyError,
  renderAvatar,
  hideAllViews,
} from "./app.js";
import { FORMATS, findFormat } from "./catalog.js";
import { getAllGames, getGameElements, elementsPickerHtml, wireElementsPicker, elementIconsHtml } from "./live-catalog.js";
import { localDateStr } from "./season.js";

async function withErrorToast(fn) {
  try {
    await fn();
  } catch (err) {
    console.error(err);
    showToast(friendlyError(err), true);
  }
}

const eventsCol = collection(db, "events");
function eventParticipantsCol() {
  return collection(db, "events", activeEvent.id, "participants");
}
function eventMatchesCol() {
  return collection(db, "events", activeEvent.id, "matches");
}

// ---------------------------------------------------------------------------
// État local (rempli en direct par les écouteurs onSnapshot)
// ---------------------------------------------------------------------------
let eventsAll = [];
let activeEvent = null; // le seul événement dont le statut n'est pas "termine"
let eventParticipants = [];
let eventMatches = [];
let unsubEvents = null;
let unsubParticipants = null;
let unsubMatches = null;
let listening = false;
let countdownInterval = null;
let showJoinForm = false;
let joinSelectedElementIds = [];

function isOrganizer() {
  return getCurrentProfile()?.role === "organisateur";
}
function myUid() {
  return getCurrentUid();
}

// ---------------------------------------------------------------------------
// Écouteurs temps réel — l'événement actif change d'identifiant à chaque
// nouvel événement créé, donc les écouteurs des sous-collections doivent se
// réabonner dynamiquement dès qu'on détecte un changement d'événement actif.
// ---------------------------------------------------------------------------
function startListening() {
  if (listening) return;
  listening = true;

  unsubEvents = onSnapshot(eventsCol, (snap) => {
    eventsAll = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    // Un vrai Événement se joue "maintenant" (voir Task #44 — le calendrier,
    // lui, est entièrement indépendant et vit dans calendar.js/la collection
    // calendarAnnouncements, sans lien avec ce qui suit). Un seul événement
    // est jamais vraiment "actif" ici :
    //   1. s'il y a un événement "en_cours" (au plus un à la fois — on ne
    //      démarre jamais un 2e événement tant que celui-ci n'est pas
    //      terminé), c'est lui l'actif ;
    //   2. sinon, le plus ancien encore en "inscription" (celui que
    //      l'organisateur a créé mais pas encore démarré) ;
    //   3. sinon, comme avant, le dernier événement créé même "termine" —
    //      pour laisser ses participants voir leur place finale.
    const running = eventsAll.find((e) => e.status === "en_cours");
    const nextScheduled = eventsAll
      .filter((e) => e.status === "inscription")
      .sort((a, b) => toDate(a.createdAt) - toDate(b.createdAt))[0];
    const mostRecent = eventsAll.slice().sort((a, b) => toDate(b.createdAt) - toDate(a.createdAt))[0];
    const newActive = running || nextScheduled || mostRecent || null;
    const changed = (newActive && newActive.id) !== (activeEvent && activeEvent.id);
    activeEvent = newActive;
    if (changed) attachActiveEventListeners();
    render();
  });
}

function attachActiveEventListeners() {
  if (unsubParticipants) unsubParticipants();
  if (unsubMatches) unsubMatches();
  eventParticipants = [];
  eventMatches = [];
  if (!activeEvent) {
    render();
    return;
  }
  unsubParticipants = onSnapshot(eventParticipantsCol(), (snap) => {
    eventParticipants = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  });
  unsubMatches = onSnapshot(eventMatchesCol(), (snap) => {
    eventMatches = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  });
}

function stopListening() {
  if (unsubEvents) unsubEvents();
  if (unsubParticipants) unsubParticipants();
  if (unsubMatches) unsubMatches();
  unsubEvents = unsubParticipants = unsubMatches = null;
  listening = false;
  // Oublier l'événement actif mémorisé : sinon, en cas de fermeture puis
  // réouverture de l'écran alors que le même événement est toujours actif,
  // startListening() croit à tort que "rien n'a changé" et ne rappelle
  // jamais attachActiveEventListeners() — les écouteurs participants/matchs
  // restent orphelins et l'écran ne reçoit plus aucune mise à jour en direct
  // (y compris ses propres résultats envoyés) tant qu'un VRAI changement
  // d'événement actif ne se produit pas.
  activeEvent = null;
  eventParticipants = [];
  eventMatches = [];
}

function startCountdownTicker() {
  if (countdownInterval) return;
  countdownInterval = setInterval(() => {
    const el = document.getElementById("ev-countdown");
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
// Utilitaires
// ---------------------------------------------------------------------------
function toDate(v) {
  if (!v) return new Date();
  if (typeof v.toDate === "function") return v.toDate();
  return new Date(v);
}
function formatCountdown(roundStartAt, roundMinutes) {
  const deadline = toDate(roundStartAt).getTime() + roundMinutes * 60000;
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) return "⏱️ Temps écoulé — vous pouvez toujours valider un résultat";
  const totalSec = Math.floor(remainingMs / 1000);
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  return `⏱️ ${mm}:${String(ss).padStart(2, "0")} restantes`;
}
function ordinal(n) {
  return n === 1 ? "1ère" : `${n}ème`;
}
// "YYYY-MM-DD" -> "JJ/MM/AAAA", même logique que formatFr dans season.js
// (simple découpage de chaîne, pas de passage par Date() qui
// réinterpréterait le fuseau).
function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function captureInputs(ids) {
  const vals = {};
  ids.forEach((id) => {
    const node = document.getElementById(id);
    if (!node) return;
    vals[id] = node.type === "checkbox" ? node.checked : node.value;
  });
  return vals;
}
function restoreInputs(vals) {
  Object.entries(vals).forEach(([id, val]) => {
    const node = document.getElementById(id);
    if (!node) return;
    if (node.type === "checkbox") node.checked = val;
    else node.value = val;
  });
}

// Le résultat validé d'un match se lit toujours à partir de gamesResult1 :
// une fois le statut "termine", les deux tableaux concordent par
// construction (vérifié par les règles Firestore), donc gamesResult1 seul
// suffit à déterminer le vainqueur — pas besoin (et pas question) de faire
// confiance à un champ "gagnant" que n'importe quel joueur aurait pu écrire.
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

function currentRoundMatches() {
  if (!activeEvent) return [];
  return eventMatches.filter((m) => m.round === activeEvent.currentRound);
}
function isRoundComplete() {
  const matches = currentRoundMatches();
  return matches.length > 0 && matches.every((m) => m.status === "termine");
}
function undefeatedCount() {
  return eventParticipants.filter((p) => p.status === "inscrit" && computeRecord(p.id).losses === 0).length;
}

// ---------------------------------------------------------------------------
// Actions — organisateur
// ---------------------------------------------------------------------------
async function createEvent() {
  const game = $("#ev-create-game").value;
  const formatId = $("#ev-create-format").value;
  const bracketMode = $("#ev-create-bracket-mode")?.value === "elimination" ? "elimination" : "suisse";
  const roundMinutes = Math.max(1, Number($("#ev-create-minutes").value) || 10);
  await addDoc(eventsCol, {
    game,
    formatId,
    bracketMode,
    // Un Événement se joue "maintenant" (voir Task #44) — la date n'est
    // plus demandée à la création, on se contente de noter celle du jour
    // (encore utile à season.js/l'historique, mais plus jamais affichée ni
    // saisie dans ce formulaire).
    scheduledDate: localDateStr(),
    roundMinutes,
    status: "inscription",
    currentRound: 0,
    roundStartAt: null,
    createdAt: serverTimestamp(),
    createdBy: myUid(),
    finishedAt: null,
  });
  showToast("Événement programmé !");
}

// Supprime un événement encore purement "programmé" (jamais l'événement
// "en_cours", ni un événement déjà "termine" — l'historique reste intact).
async function deleteEvent(eventId) {
  const target = eventsAll.find((e) => e.id === eventId);
  if (target && target.status !== "inscription") {
    showToast("Seul un événement pas encore démarré peut être supprimé.", true);
    return;
  }
  await deleteDoc(doc(eventsCol, eventId));
  showToast("Événement supprimé du calendrier.");
}

async function validateEventParticipant(uid) {
  await updateDoc(doc(eventParticipantsCol(), uid), { status: "inscrit" });
}
async function rejectEventParticipant(uid) {
  await updateDoc(doc(eventParticipantsCol(), uid), { status: "refuse" });
}
async function kickEventParticipant(uid) {
  await updateDoc(doc(eventParticipantsCol(), uid), { status: "exclu" });
  showToast("Joueur retiré de l'événement.");
}

// slotIndex : position du match dans sa manche, uniquement significatif en
// mode élimination (voir Task #45/#46) — sert à savoir quels vainqueurs
// s'affrontent à la manche suivante (advanceEliminationRound ci-dessous) et
// à dessiner l'arbre du bracket dans l'écran d'affichage
// (organizer-display.js). Toujours null en mode suisse (aucun ordre à
// préserver d'une manche à l'autre).
async function createMatch(round, a, b, slotIndex = null) {
  const format = findFormat(activeEvent.formatId);
  await addDoc(eventMatchesCol(), {
    round,
    slotIndex,
    player1Uid: a.id,
    player1Pseudo: a.pseudo,
    player2Uid: b.id,
    player2Pseudo: b.pseudo,
    isBye: false,
    format: activeEvent.formatId,
    gamesCount: format.games,
    status: "en_cours",
    gamesResult1: null,
    gamesResult2: null,
  });
}
async function createByeMatch(round, p, slotIndex = null) {
  const format = findFormat(activeEvent.formatId);
  await addDoc(eventMatchesCol(), {
    round,
    slotIndex,
    player1Uid: p.id,
    player1Pseudo: p.pseudo,
    player2Uid: null,
    player2Pseudo: null,
    isBye: true,
    format: activeEvent.formatId,
    gamesCount: format.games,
    status: "termine",
    gamesResult1: null,
    gamesResult2: null,
    // Un bye est "termine" dès sa création (victoire automatique) — voir
    // resolvedAt sur submitEventResult ci-dessous pour pourquoi ce champ
    // existe : season.js s'en sert pour savoir quel JOUR ce match compte
    // pour les points de saison (voir computeSeasonStandings).
    resolvedAt: serverTimestamp(),
  });
}

function nextPowerOf2(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

async function startEvent() {
  const registered = eventParticipants.filter((p) => p.status === "inscrit");
  if (registered.length < 2) {
    showToast("Il faut au moins 2 joueurs inscrits pour démarrer.", true);
    return;
  }
  if (activeEvent.bracketMode === "elimination") {
    await startEventElimination(registered);
  } else {
    await startEventSuisse(registered);
  }
  showToast("Événement démarré, manche 1 appariée !");
}

async function startEventSuisse(registered) {
  const pool = shuffle(registered.slice());
  while (pool.length >= 2) {
    const a = pool.pop();
    const b = pool.pop();
    await createMatch(1, a, b);
  }
  if (pool.length === 1) await createByeMatch(1, pool[0]);
  await updateDoc(doc(eventsCol, activeEvent.id), { status: "en_cours", currentRound: 1, roundStartAt: null });
}

// Bracket à élimination directe (Task #45) : bracketSize est la prochaine
// puissance de 2 au-dessus du nombre d'inscrits (byes pour compléter). Une
// fois la manche 1 posée, plus jamais besoin de bye (le nombre de vainqueurs
// reste toujours une puissance de 2, donc toujours pair) — voir
// advanceEliminationRound ci-dessous.
async function startEventElimination(registered) {
  const pool = shuffle(registered.slice());
  const n = pool.length;
  const bracketSize = nextPowerOf2(n);
  const byesNeeded = bracketSize - n;

  let slotIndex = 0;
  for (let i = 0; i < byesNeeded; i++) {
    await createByeMatch(1, pool.shift(), slotIndex);
    slotIndex++;
  }
  while (pool.length >= 2) {
    const a = pool.pop();
    const b = pool.pop();
    await createMatch(1, a, b, slotIndex);
    slotIndex++;
  }
  await updateDoc(doc(eventsCol, activeEvent.id), {
    status: "en_cours",
    currentRound: 1,
    roundStartAt: null,
    bracketTotalRounds: Math.log2(bracketSize),
  });
}

async function startRoundTimer() {
  await updateDoc(doc(eventsCol, activeEvent.id), { roundStartAt: serverTimestamp() });
  showToast("Manche lancée !");
}

async function pairNextRound() {
  if (activeEvent.bracketMode === "elimination") {
    await advanceEliminationRound();
  } else {
    await pairNextRoundSuisse();
  }
}

async function pairNextRoundSuisse() {
  const registered = eventParticipants.filter((p) => p.status === "inscrit");
  const groups = new Map(); // victoires -> [participants]
  registered.forEach((p) => {
    const { wins } = computeRecord(p.id);
    if (!groups.has(wins)) groups.set(wins, []);
    groups.get(wins).push(p);
  });
  const winCounts = [...groups.keys()].sort((a, b) => b - a);
  const nextRound = activeEvent.currentRound + 1;

  let carryOver = [];
  for (const w of winCounts) {
    const pool = shuffle([...carryOver, ...groups.get(w)]);
    carryOver = [];
    while (pool.length >= 2) {
      const a = pool.pop();
      const b = pool.pop();
      await createMatch(nextRound, a, b);
    }
    if (pool.length === 1) carryOver = pool; // reporté au groupe de victoires suivant
  }
  if (carryOver.length === 1) await createByeMatch(nextRound, carryOver[0]);

  await updateDoc(doc(eventsCol, activeEvent.id), { currentRound: nextRound, roundStartAt: null });
  showToast(`Manche ${nextRound} appariée !`);
}

// Bracket à élimination directe : les vainqueurs de la manche qui vient de
// se terminer s'affrontent 2 par 2, dans l'ordre de leur slotIndex (0 vs 1
// -> nouveau slot 0, 2 vs 3 -> nouveau slot 1, etc.) — jamais besoin de bye
// ici, le nombre de vainqueurs est toujours pair (voir commentaire sur
// startEventElimination).
async function advanceEliminationRound() {
  const nextRound = activeEvent.currentRound + 1;
  const prevMatches = eventMatches
    .filter((m) => m.round === activeEvent.currentRound)
    .sort((a, b) => (a.slotIndex ?? 0) - (b.slotIndex ?? 0));
  const winners = prevMatches.map((m) => {
    const winnerUid = matchWinnerUid(m);
    return eventParticipants.find((p) => p.id === winnerUid);
  });

  let slotIndex = 0;
  for (let i = 0; i < winners.length; i += 2) {
    const a = winners[i];
    const b = winners[i + 1];
    if (a && b) await createMatch(nextRound, a, b, slotIndex);
    else if (a) await createByeMatch(nextRound, a, slotIndex);
    slotIndex++;
  }

  await updateDoc(doc(eventsCol, activeEvent.id), { currentRound: nextRound, roundStartAt: null });
  showToast(`Manche ${nextRound} appariée !`);
}

async function finalizeEvent() {
  const registered = eventParticipants.filter((p) => p.status === "inscrit");
  const ranked = registered
    .map((p) => ({ ...p, ...computeRecord(p.id) }))
    .sort((a, b) => b.wins - a.wins || a.losses - b.losses);
  for (let i = 0; i < ranked.length; i++) {
    await updateDoc(doc(eventParticipantsCol(), ranked[i].id), { placement: i + 1 });
  }
  await updateDoc(doc(eventsCol, activeEvent.id), { status: "termine", finishedAt: serverTimestamp() });
  showToast("Événement terminé ! Résultats disponibles pour tous.");
}

// ---------------------------------------------------------------------------
// Actions — joueur
// ---------------------------------------------------------------------------
// Version générique (n'importe quel eventId, pas forcément l'événement
// actif) — réutilisée par le formulaire d'inscription de l'écran Événement
// ci-dessous (toujours l'actif) ET par le nouveau bouton "Je participe" du
// Calendrier (n'importe quel événement encore en "inscription", voir plus
// bas) : une pré-inscription à un événement pas encore actif attend
// simplement son tour, exactement comme si on l'avait rejoint une fois
// devenu actif — mêmes règles Firestore, aucune distinction côté serveur.
async function requestJoinEventGeneric(eventId, elementIds) {
  const profile = getCurrentProfile();
  const uid = myUid();
  await setDoc(doc(db, "events", eventId, "participants", uid), {
    uid,
    pseudo: profile.pseudo,
    photoDataUrl: profile.photoDataUrl || null,
    decorations: profile.decorations || { owned: [], active: null },
    status: isOrganizer() ? "inscrit" : "liste_attente",
    placement: null,
    joinedAt: serverTimestamp(),
  });
  if (elementIds && elementIds.length) {
    await setDoc(doc(db, "events", eventId, "participants", uid, "deck", "info"), {
      elements: elementIds,
    });
  }
}

async function requestJoinEvent(elementIds) {
  if (!activeEvent) return;
  await requestJoinEventGeneric(activeEvent.id, elementIds);
  showJoinForm = false;
  joinSelectedElementIds = [];
  showToast(isOrganizer() ? "Tu es inscrit." : "Demande d'inscription envoyée à l'organisateur.");
}

async function leaveEvent() {
  await updateDoc(doc(eventParticipantsCol(), myUid()), { status: "parti" });
  showToast("Tu as quitté l'événement.");
}

async function submitEventResult(match, myResults) {
  const uid = myUid();
  const field = match.player1Uid === uid ? "gamesResult1" : "gamesResult2";
  const otherResults = match.player1Uid === uid ? match.gamesResult2 : match.gamesResult1;

  const isMatch =
    otherResults != null &&
    myResults.length === otherResults.length &&
    myResults.every((g, i) => {
      const o = otherResults[i];
      return o && g.myScore === o.oppScore && g.oppScore === o.myScore && g.iWon === !o.iWon;
    });

  const nextStatus = isMatch ? "termine" : otherResults == null ? "en_cours" : "litige";

  await updateDoc(doc(eventMatchesCol(), match.id), {
    [field]: myResults,
    status: nextStatus,
    // Même principe que resolvedAt sur les duels du jour (daily-duel.js) :
    // horodatage posé UNIQUEMENT au moment où le match devient "termine",
    // pour que season.js puisse rattacher ses points à la bonne journée
    // (voir computeSeasonStandings) sans dépendre de createdAt (qui, lui,
    // daterait du moment de l'appariement, pas de la résolution du match).
    ...(nextStatus === "termine" ? { resolvedAt: serverTimestamp() } : {}),
  });
}

// ---------------------------------------------------------------------------
// Rendu — panneau organisateur
// ---------------------------------------------------------------------------
function rowHtml(p, actionsHtml) {
  return `
    <div class="dd-row" data-uid="${p.id}">
      <div class="dd-row-avatar" data-avatar="${p.id}"></div>
      <div class="dd-row-name">${escapeHtml(p.pseudo)}</div>
      <div class="dd-row-actions">${actionsHtml}</div>
    </div>`;
}
function matchRowHtml(m) {
  if (m.isBye) {
    return `<div class="dd-row"><div class="dd-row-name">${escapeHtml(m.player1Pseudo)} <span class="dd-pill">🎁 bye (victoire auto)</span></div></div>`;
  }
  let label = "🟡 en cours";
  if (m.status === "litige") label = "⚠️ litige";
  if (m.status === "termine") {
    const winnerUid = matchWinnerUid(m);
    const winnerPseudo = winnerUid === m.player1Uid ? m.player1Pseudo : m.player2Pseudo;
    label = `✅ ${escapeHtml(winnerPseudo)} gagne`;
  }
  return `<div class="dd-row"><div class="dd-row-name">${escapeHtml(m.player1Pseudo)} 🆚 ${escapeHtml(m.player2Pseudo)} <span class="dd-pill">${label}</span></div></div>`;
}

function renderEventOrganizerPanel() {
  const el = $("#ev-organizer-panel");
  if (!el) return;
  if (!isOrganizer()) {
    el.style.display = "none";
    return;
  }
  el.style.display = "";

  const preserved = captureInputs(["ev-create-minutes", "ev-create-bracket-mode"]);
  let html = `<h3>🏆 Organisateur — Événement</h3>`;

  // Le formulaire de création reste toujours disponible : un événement se
  // joue "maintenant" (voir Task #44 — plus de date à choisir, contrairement
  // au Calendrier qui, lui, est indépendant et sert à annoncer des dates
  // futures sans lien avec ceci, voir calendar.js).
  const gameOptions = getAllGames().map((g) => `<option value="${g}">${g}</option>`).join("");
  const formatOptions = FORMATS.map((f) => `<option value="${f.id}">${f.label}</option>`).join("");
  html += `
    <div class="manage-grid-label">Démarrer un événement</div>
    <label for="ev-create-game">Jeu</label>
    <select id="ev-create-game">${gameOptions}</select>
    <label for="ev-create-format">Format</label>
    <select id="ev-create-format">${formatOptions}</select>
    <label for="ev-create-bracket-mode">Type de tournoi</label>
    <select id="ev-create-bracket-mode">
      <option value="suisse">Tournoi à la suisse</option>
      <option value="elimination">Tournoi par élimination</option>
    </select>
    <label for="ev-create-minutes">Temps par manche (minutes)</label>
    <input type="number" id="ev-create-minutes" min="1" value="10">
    <button class="btn btn-primary" type="button" id="ev-btn-create">Programmer l'événement</button>
  `;

  if (!activeEvent || activeEvent.status === "termine") {
    el.innerHTML = html;
    $("#ev-btn-create")?.addEventListener("click", () => withErrorToast(createEvent));
    restoreInputs(preserved);
    return;
  }

  const bracketLabel = activeEvent.bracketMode === "elimination" ? "🏹 Élimination directe" : "🇨🇭 Tournoi à la suisse";
  html += `<div class="manage-grid-label">Événement en préparation / en cours</div>`;
  html += `<p class="settings-note">${escapeHtml(activeEvent.game)} — ${findFormat(activeEvent.formatId).label} — ${bracketLabel} — ${activeEvent.roundMinutes} min/manche</p>`;

  const pending = eventParticipants.filter((p) => p.status === "liste_attente");
  const registered = eventParticipants.filter((p) => p.status === "inscrit");

  if (activeEvent.status === "inscription") {
    if (pending.length) {
      html += `<div class="manage-grid-label">Demandes en attente</div>`;
      pending.forEach((p) => {
        html += rowHtml(
          p,
          `<button class="btn-mini btn-mini-ok" data-action="ev-validate" data-uid="${p.id}">✅</button>
           <button class="btn-mini btn-mini-no" data-action="ev-reject" data-uid="${p.id}">❌</button>`
        );
      });
    }
    html += `<div class="manage-grid-label">Inscrits (${registered.length})</div>`;
    if (registered.length) {
      registered.forEach((p) => {
        html += rowHtml(p, `<button class="btn-mini btn-mini-no" data-action="ev-kick" data-uid="${p.id}">Exclure</button>`);
      });
    } else {
      html += `<p class="settings-note">Personne d'inscrit pour l'instant.</p>`;
    }
    html += `<button class="btn btn-primary" type="button" id="ev-btn-start"${registered.length < 2 ? " disabled" : ""}>Démarrer l'événement</button>`;
  } else if (activeEvent.status === "en_cours") {
    html += `<p class="settings-note">Manche ${activeEvent.currentRound}</p>`;
    const matches = currentRoundMatches();

    if (!activeEvent.roundStartAt) {
      html += `<div class="manage-grid-label">Appariements</div>`;
      matches.forEach((m) => (html += matchRowHtml(m)));
      html += `<button class="btn btn-primary" type="button" id="ev-btn-start-round">Démarrer la manche</button>`;
    } else {
      html += `<p id="ev-countdown" class="dd-pill">${formatCountdown(activeEvent.roundStartAt, activeEvent.roundMinutes)}</p>`;
      html += `<div class="manage-grid-label">Matchs</div>`;
      matches.forEach((m) => (html += matchRowHtml(m)));

      if (isRoundComplete()) {
        if (undefeatedCount() <= 1) {
          html += `<button class="btn btn-primary" type="button" id="ev-btn-finalize">🏆 Voir les résultats finaux</button>`;
        } else {
          const nextRoundLabel = activeEvent.bracketMode === "elimination" ? "Manche suivante (bracket)" : "Lancer le prochain regroupement";
          html += `<button class="btn btn-primary" type="button" id="ev-btn-next-round">${nextRoundLabel}</button>`;
        }
      } else {
        html += `<p class="settings-note">En attente que tous les matchs de cette manche soient validés…</p>`;
      }
    }
  }

  el.innerHTML = html;

  el.querySelectorAll('[data-action="ev-validate"]').forEach((btn) =>
    btn.addEventListener("click", () => withErrorToast(() => validateEventParticipant(btn.dataset.uid)))
  );
  el.querySelectorAll('[data-action="ev-reject"]').forEach((btn) =>
    btn.addEventListener("click", () => withErrorToast(() => rejectEventParticipant(btn.dataset.uid)))
  );
  el.querySelectorAll('[data-action="ev-kick"]').forEach((btn) =>
    btn.addEventListener("click", () => withErrorToast(() => kickEventParticipant(btn.dataset.uid)))
  );
  $("#ev-btn-create")?.addEventListener("click", () => withErrorToast(createEvent));
  $("#ev-btn-start")?.addEventListener("click", () => withErrorToast(startEvent));
  $("#ev-btn-start-round")?.addEventListener("click", () => withErrorToast(startRoundTimer));
  $("#ev-btn-next-round")?.addEventListener("click", () => withErrorToast(pairNextRound));
  $("#ev-btn-finalize")?.addEventListener("click", () => withErrorToast(finalizeEvent));

  [...pending, ...registered].forEach((p) => {
    const holder = el.querySelector(`[data-avatar="${p.id}"]`);
    if (holder) renderAvatar(holder, p, 38);
  });

  restoreInputs(preserved);
}

// ---------------------------------------------------------------------------
// Rendu — carte joueur
// ---------------------------------------------------------------------------
function renderEventPlayerArea() {
  const el = $("#ev-player-area");
  if (!el) return;

  const me = eventParticipants.find((p) => p.id === myUid()) || null;

  // Un événement "termine" ne reste affiché (voir startListening) que pour
  // laisser ses participants voir leur place finale — pour tout le monde
  // d'autre, c'est comme s'il n'y avait aucun événement en cours.
  if (!activeEvent || (activeEvent.status === "termine" && me?.status !== "inscrit")) {
    el.innerHTML = `<p class="settings-note">Aucun événement n'est disponible pour le moment.</p>`;
    return;
  }

  if (activeEvent.status === "termine") {
    // me.status === "inscrit" ici (garanti par le filtre ci-dessus)
    el.innerHTML = me.placement
      ? `<div class="dd-notif"><h3>🏆 Événement terminé !</h3><p>Félicitations pour la ${ordinal(me.placement)} place !</p></div>`
      : `<p class="settings-note">L'événement est terminé, calcul du classement en cours…</p>`;
    return;
  }

  if (!me || ["refuse", "exclu", "parti"].includes(me.status)) {
    let msg = `Un événement <b>${escapeHtml(activeEvent.game)}</b> (${findFormat(activeEvent.formatId).label}) est disponible !`;
    if (me?.status === "refuse") msg = "Ta demande d'inscription a été refusée par l'organisateur.";
    if (me?.status === "exclu") msg = "Tu as été retiré de cet événement par l'organisateur.";
    if (me?.status === "parti") msg = "Tu as quitté cet événement.";
    const gameElements = getGameElements(activeEvent.game);

    if (!gameElements.length) {
      el.innerHTML = `
        <p class="settings-note">${msg}</p>
        <button class="btn btn-primary" type="button" id="ev-btn-join">🏆 Événement disponible : ${escapeHtml(activeEvent.game)}</button>
      `;
      $("#ev-btn-join")?.addEventListener("click", () => withErrorToast(() => requestJoinEvent()));
      return;
    }

    if (!showJoinForm) {
      el.innerHTML = `
        <p class="settings-note">${msg}</p>
        <button class="btn btn-primary" type="button" id="ev-btn-join">🏆 Événement disponible : ${escapeHtml(activeEvent.game)}</button>
      `;
      $("#ev-btn-join")?.addEventListener("click", () => {
        showJoinForm = true;
        joinSelectedElementIds = [];
        render();
      });
      return;
    }

    el.innerHTML = `
      <p class="settings-note">${msg}</p>
      <div id="ev-join-elements-wrap">${elementsPickerHtml(activeEvent.game, joinSelectedElementIds)}</div>
      <button class="btn btn-primary" type="button" id="ev-btn-join-confirm">Confirmer l'inscription</button>
      <button class="btn btn-ghost" type="button" id="ev-btn-join-cancel">Annuler</button>
    `;
    wireElementsPicker($("#ev-join-elements-wrap"), joinSelectedElementIds);
    $("#ev-btn-join-confirm")?.addEventListener("click", () => {
      if (!joinSelectedElementIds.length) {
        showToast("Choisis au moins un élément pour ton deck.", true);
        return;
      }
      withErrorToast(() => requestJoinEvent(joinSelectedElementIds.slice()));
    });
    $("#ev-btn-join-cancel")?.addEventListener("click", () => {
      showJoinForm = false;
      joinSelectedElementIds = [];
      render();
    });
    return;
  }

  if (me.status === "liste_attente") {
    el.innerHTML = `
      <p class="settings-note">⏳ En attente de validation par l'organisateur…</p>
      <button class="btn btn-ghost" type="button" id="ev-btn-leave">Quitter l'événement</button>
    `;
    $("#ev-btn-leave")?.addEventListener("click", () => withErrorToast(leaveEvent));
    return;
  }

  // me.status === "inscrit" et l'événement n'est pas "termine" à partir d'ici
  if (activeEvent.status === "inscription") {
    el.innerHTML = `
      <p class="settings-note">✅ Tu es inscrit ! En attente du démarrage de l'événement par l'organisateur.</p>
      <button class="btn btn-ghost" type="button" id="ev-btn-leave">Quitter l'événement</button>
    `;
    $("#ev-btn-leave")?.addEventListener("click", () => withErrorToast(leaveEvent));
    return;
  }

  // activeEvent.status === "en_cours"
  const myMatch = eventMatches.find(
    (m) => m.round === activeEvent.currentRound && (m.player1Uid === myUid() || m.player2Uid === myUid())
  );
  const preserved = captureInputs(buildGameInputIds(myMatch));

  let html = "";
  if (!myMatch) {
    html += `<p class="settings-note">En attente du prochain regroupement…</p>`;
  } else if (myMatch.isBye) {
    html += `<div class="dd-notif"><h3>🎁 Tour de repos</h3><p class="settings-note">Pas d'adversaire cette manche — victoire automatique. En attente de la suite…</p></div>`;
  } else if (!activeEvent.roundStartAt) {
    const oppPseudo = myMatch.player1Uid === myUid() ? myMatch.player2Pseudo : myMatch.player1Pseudo;
    html += `<div class="dd-notif"><h3>⚔️ Manche ${activeEvent.currentRound}</h3><p class="settings-note">Tu affrontes <b>${escapeHtml(oppPseudo)}</b>. En attente du lancement du chronomètre par l'organisateur…</p></div>`;
  } else {
    html += renderEventMatchCard(myMatch);
  }

  html += `<button class="btn btn-ghost" type="button" id="ev-btn-leave">Quitter l'événement</button>`;
  el.innerHTML = html;
  $("#ev-btn-leave")?.addEventListener("click", () => withErrorToast(leaveEvent));
  wireEventMatchEvents(myMatch);
  restoreInputs(preserved);
}

function buildGameInputIds(match) {
  if (!match || match.isBye) return [];
  const format = findFormat(match.format);
  const ids = [];
  for (let i = 0; i < format.games; i++) ids.push(`ev-game-${i}-my`, `ev-game-${i}-opp`, `ev-game-${i}-won`);
  return ids;
}

function renderEventMatchCard(match) {
  const uid = myUid();
  const iAmP1 = match.player1Uid === uid;
  const myResults = iAmP1 ? match.gamesResult1 : match.gamesResult2;
  const oppPseudo = iAmP1 ? match.player2Pseudo : match.player1Pseudo;
  const countdown = formatCountdown(activeEvent.roundStartAt, activeEvent.roundMinutes);

  let litigeNote = "";
  if (match.status === "litige") {
    litigeNote = `<p class="dd-error">⚠️ Vos résultats ne concordent pas — corrigez et renvoyez.</p>`;
  }

  if (match.status === "termine") {
    const won = matchWinnerUid(match) === uid;
    return `<div class="dd-notif"><h3>⚔️ Manche ${activeEvent.currentRound} contre ${escapeHtml(oppPseudo)}</h3>
      <p id="ev-countdown" class="settings-note">${countdown}</p>
      <p class="settings-note">Résultat validé : ${won ? "victoire ✅" : "défaite"}. En attente des autres joueurs…</p></div>`;
  }

  if (myResults) {
    return `<div class="dd-notif"><h3>⚔️ Manche ${activeEvent.currentRound} contre ${escapeHtml(oppPseudo)}</h3>
      <p id="ev-countdown" class="settings-note">${countdown}</p>
      ${litigeNote}
      <p class="settings-note">Ton résultat envoyé. En attente de ${escapeHtml(oppPseudo)}…</p>
      <button class="btn btn-ghost" type="button" id="ev-btn-edit-result">Corriger mon résultat</button></div>`;
  }

  return `<div class="dd-notif"><h3>⚔️ Manche ${activeEvent.currentRound} contre ${escapeHtml(oppPseudo)}</h3>
    <p id="ev-countdown" class="settings-note">${countdown}</p>
    ${litigeNote}
    ${renderEventResultForm(findFormat(match.format).games)}
  </div>`;
}

function renderEventResultForm(n) {
  let rows = "";
  for (let i = 0; i < n; i++) {
    rows += `
      <div class="ev-game-row">
        <span class="ev-game-label">Manche ${i + 1}</span>
        <input type="number" id="ev-game-${i}-my" min="0" placeholder="Ton score" required>
        <input type="number" id="ev-game-${i}-opp" min="0" placeholder="Score adverse" required>
        <label><input type="checkbox" id="ev-game-${i}-won" style="width:auto;display:inline-block;"> Gagnée</label>
      </div>`;
  }
  return `<form id="ev-result-form">${rows}<button class="btn btn-primary" type="submit">Valider mon résultat</button></form>`;
}

function wireEventMatchEvents(match) {
  if (!match || match.isBye) return;
  $("#ev-btn-edit-result")?.addEventListener("click", () =>
    withErrorToast(async () => {
      const uid = myUid();
      const field = match.player1Uid === uid ? "gamesResult1" : "gamesResult2";
      await updateDoc(doc(eventMatchesCol(), match.id), { [field]: null });
    })
  );
  $("#ev-result-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const format = findFormat(match.format);
    const results = [];
    for (let i = 0; i < format.games; i++) {
      results.push({
        myScore: Number($(`#ev-game-${i}-my`)?.value),
        oppScore: Number($(`#ev-game-${i}-opp`)?.value),
        iWon: $(`#ev-game-${i}-won`)?.checked || false,
      });
    }
    withErrorToast(() => submitEventResult(match, results));
  });
}


// ---------------------------------------------------------------------------
// Rendu global + navigation
// ---------------------------------------------------------------------------
function render() {
  renderEventOrganizerPanel();
  renderEventPlayerArea();
}

export function showEventScreen() {
  hideAllViews();
  $("#view-event")?.classList.add("active");
  startListening();
  startCountdownTicker();
}
function closeEventScreen() {
  hideAllViews();
  $("#view-app")?.classList.add("active");
  stopListening();
  stopCountdownTicker();
}

// ---------------------------------------------------------------------------
// Historique des événements
// ---------------------------------------------------------------------------
async function openEventHistory() {
  hideAllViews();
  $("#view-event-history")?.classList.add("active");
  const el = $("#ev-history-list");
  $("#ev-history-detail").innerHTML = "";
  el.innerHTML = `<p class="settings-note">Chargement…</p>`;
  const snap = await getDocs(eventsCol);
  const past = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((e) => e.status === "termine")
    .sort((a, b) => toDate(b.finishedAt).getTime() - toDate(a.finishedAt).getTime());

  if (!past.length) {
    el.innerHTML = `<p class="settings-note">Aucun événement terminé pour l'instant.</p>`;
    return;
  }
  el.innerHTML = "";
  past.forEach((e) => {
    const row = document.createElement("div");
    row.className = "dd-row";
    row.innerHTML = `
      <div class="dd-row-name">${escapeHtml(e.game)} — ${findFormat(e.formatId).label}</div>
      <div class="dd-row-actions"><button class="btn-mini" data-action="ev-history-view" data-id="${e.id}">Voir les résultats</button></div>
    `;
    el.appendChild(row);
  });
  el.querySelectorAll('[data-action="ev-history-view"]').forEach((btn) => {
    btn.addEventListener("click", () => withErrorToast(() => showEventHistoryDetail(btn.dataset.id)));
  });
}

async function showEventHistoryDetail(eventId) {
  const detailEl = $("#ev-history-detail");
  detailEl.innerHTML = `<p class="settings-note">Chargement…</p>`;
  const [eventSnap, partsSnap] = await Promise.all([
    getDoc(doc(eventsCol, eventId)),
    getDocs(collection(db, "events", eventId, "participants")),
  ]);
  const gameName = eventSnap.exists() ? eventSnap.data().game : null;
  const gameElements = gameName ? getGameElements(gameName) : [];
  const ranked = partsSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((p) => p.placement != null)
    .sort((a, b) => a.placement - b.placement);

  let decksByUid = {};
  if (gameElements.length) {
    const deckSnaps = await Promise.all(
      ranked.map((p) =>
        getDoc(doc(db, "events", eventId, "participants", p.id, "deck", "info")).catch(() => null)
      )
    );
    ranked.forEach((p, i) => {
      const snap = deckSnaps[i];
      decksByUid[p.id] = snap && snap.exists() ? snap.data().elements : null;
    });
  }

  detailEl.innerHTML = `<div class="manage-grid-label">Classement final</div>`;
  ranked.forEach((p) => {
    const row = document.createElement("div");
    row.className = "dd-row";
    const avatarHolder = document.createElement("div");
    avatarHolder.className = "dd-row-avatar";
    row.appendChild(avatarHolder);
    const name = document.createElement("div");
    name.className = "dd-row-name";
    name.innerHTML = `${ordinal(p.placement)} — ${escapeHtml(p.pseudo)}`;
    if (gameElements.length) {
      name.innerHTML += `<br>${elementIconsHtml(gameName, decksByUid[p.id])}`;
    }
    row.appendChild(name);
    detailEl.appendChild(row);
    renderAvatar(avatarHolder, p, 38);
  });
  detailEl.scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeEventHistoryScreen() {
  hideAllViews();
  $("#view-app")?.classList.add("active");
}

document.addEventListener("DOMContentLoaded", () => {
  $("#btn-open-event")?.addEventListener("click", showEventScreen);
  $("#btn-close-event")?.addEventListener("click", closeEventScreen);
  $("#btn-open-event-history")?.addEventListener("click", () => withErrorToast(openEventHistory));
  $("#btn-close-event-history")?.addEventListener("click", closeEventHistoryScreen);
});
