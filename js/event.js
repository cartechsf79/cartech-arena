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

// ---------------------------------------------------------------------------
// État local — écran Calendrier (voir plus bas) : partage les mêmes
// écouteurs eventsCol que l'écran Événement ci-dessus (mêmes données,
// startListening/stopListening réutilisés tels quels), mais garde son
// propre état d'affichage (mois affiché, événement déplié, formulaire
// d'inscription, listes de participants mises en cache).
// ---------------------------------------------------------------------------
let calendarMonthOffset = 0; // 0 = mois actuel, +1 = suivant, -1 = précédent
let calendarExpandedEventId = null;
let calendarJoinFormEventId = null;
let calendarJoinSelectedElementIds = [];
let calendarParticipantsByEventId = {}; // eventId -> [{id, pseudo, status, ...}]
let calendarParticipantsLoading = {}; // eventId -> true pendant le fetch, évite les doublons
let calendarShowParticipantsFor = null; // eventId dont la liste des inscrits est dépliée

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
    // L'organisateur peut programmer PLUSIEURS événements à l'avance (voir
    // Task #28 — calendrier) : ils sont tous créés avec le statut
    // "inscription" et une date prévue (scheduledDate). Un seul est jamais
    // vraiment "actif" (celui sur lequel portent inscriptions/appariements/
    // matchs ci-dessous) — les autres restent visibles, en lecture seule,
    // dans le calendrier (voir upcomingEvents()) en attendant leur tour :
    //   1. s'il y a un événement "en_cours" (au plus un à la fois — on ne
    //      démarre jamais un 2e événement tant que celui-ci n'est pas
    //      terminé), c'est lui l'actif ;
    //   2. sinon, parmi ceux en "inscription", celui dont la date prévue est
    //      la plus proche (une date manquante — anciens comptes d'avant
    //      cette fonctionnalité — passe en premier, ce qui préserve
    //      exactement le comportement d'avant sur une installation
    //      existante) ;
    //   3. sinon, comme avant, le dernier événement créé même "termine" —
    //      pour laisser ses participants voir leur place finale.
    const running = eventsAll.find((e) => e.status === "en_cours");
    const nextScheduled = eventsAll
      .filter((e) => e.status === "inscription")
      .sort((a, b) => (a.scheduledDate || "").localeCompare(b.scheduledDate || ""))[0];
    const mostRecent = eventsAll.slice().sort((a, b) => toDate(b.createdAt) - toDate(a.createdAt))[0];
    const newActive = running || nextScheduled || mostRecent || null;
    const changed = (newActive && newActive.id) !== (activeEvent && activeEvent.id);
    activeEvent = newActive;
    if (changed) attachActiveEventListeners();
    render();
    renderCalendarScreen();
  });
}

// Tous les événements "à venir" (programmés, pas encore l'événement actif
// ci-dessus, pas encore terminés) — affichés en lecture seule dans le
// calendrier, triés par date prévue.
function upcomingEvents() {
  return eventsAll
    .filter((e) => e.status !== "termine" && e.id !== (activeEvent && activeEvent.id))
    .sort((a, b) => (a.scheduledDate || "").localeCompare(b.scheduledDate || ""));
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
function formatFrDate(dateStr) {
  const [y, m, d] = (dateStr || "").split("-");
  return y && m && d ? `${d}/${m}/${y}` : "date non précisée";
}
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
  const scheduledDate = $("#ev-create-date").value;
  const roundMinutes = Math.max(1, Number($("#ev-create-minutes").value) || 10);
  if (!scheduledDate) {
    showToast("Choisis une date pour l'événement.", true);
    return;
  }
  await addDoc(eventsCol, {
    game,
    formatId,
    scheduledDate,
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

async function createMatch(round, a, b) {
  const format = findFormat(activeEvent.formatId);
  await addDoc(eventMatchesCol(), {
    round,
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
async function createByeMatch(round, p) {
  const format = findFormat(activeEvent.formatId);
  await addDoc(eventMatchesCol(), {
    round,
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

async function startEvent() {
  const registered = eventParticipants.filter((p) => p.status === "inscrit");
  if (registered.length < 2) {
    showToast("Il faut au moins 2 joueurs inscrits pour démarrer.", true);
    return;
  }
  const pool = shuffle(registered.slice());
  while (pool.length >= 2) {
    const a = pool.pop();
    const b = pool.pop();
    await createMatch(1, a, b);
  }
  if (pool.length === 1) await createByeMatch(1, pool[0]);
  await updateDoc(doc(eventsCol, activeEvent.id), { status: "en_cours", currentRound: 1, roundStartAt: null });
  showToast("Événement démarré, manche 1 appariée !");
}

async function startRoundTimer() {
  await updateDoc(doc(eventsCol, activeEvent.id), { roundStartAt: serverTimestamp() });
  showToast("Manche lancée !");
}

async function pairNextRound() {
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

  const preserved = captureInputs(["ev-create-minutes", "ev-create-date"]);
  let html = `<h3>🏆 Organisateur — Événement</h3>`;

  // Le formulaire de création reste toujours disponible : l'organisateur
  // peut programmer plusieurs événements à l'avance (voir le calendrier
  // ci-dessous) — pas seulement un à la fois comme avant.
  const gameOptions = getAllGames().map((g) => `<option value="${g}">${g}</option>`).join("");
  const formatOptions = FORMATS.map((f) => `<option value="${f.id}">${f.label}</option>`).join("");
  html += `
    <div class="manage-grid-label">Programmer un événement</div>
    <label for="ev-create-game">Jeu</label>
    <select id="ev-create-game">${gameOptions}</select>
    <label for="ev-create-format">Format</label>
    <select id="ev-create-format">${formatOptions}</select>
    <label for="ev-create-date">Date</label>
    <input type="date" id="ev-create-date" required>
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

  html += `<div class="manage-grid-label">Événement en préparation / en cours</div>`;
  html += `<p class="settings-note">${escapeHtml(activeEvent.game)} — ${findFormat(activeEvent.formatId).label} — 📅 ${formatFrDate(activeEvent.scheduledDate)} — ${activeEvent.roundMinutes} min/manche</p>`;

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
          html += `<button class="btn btn-primary" type="button" id="ev-btn-next-round">Lancer le prochain regroupement</button>`;
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
    el.innerHTML = `<p class="settings-note">Aucun événement n'est disponible pour le moment — regarde le calendrier ci-dessous pour voir ce qui est prévu.</p>`;
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
    let msg = `Un événement <b>${escapeHtml(activeEvent.game)}</b> (${findFormat(activeEvent.formatId).label}) est disponible ! 📅 ${formatFrDate(activeEvent.scheduledDate)}`;
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
// Rendu — calendrier des événements à venir (tout le monde) — voir Task #28.
// L'organisateur peut en plus supprimer un événement programmé qu'il n'a pas
// encore démarré (jamais l'événement en cours ni un événement terminé).
// ---------------------------------------------------------------------------
function renderEventCalendarPanel() {
  const el = $("#ev-calendar-panel");
  if (!el) return;

  const upcoming = upcomingEvents();
  if (!upcoming.length) {
    el.innerHTML = "";
    el.style.display = "none";
    return;
  }
  el.style.display = "";

  let html = `<h3>📅 Calendrier — événements à venir</h3>`;
  upcoming.forEach((e) => {
    const deleteBtn = isOrganizer()
      ? `<button class="btn-mini btn-mini-no" data-action="ev-delete" data-id="${e.id}">Supprimer</button>`
      : "";
    html += `
      <div class="dd-row">
        <div class="dd-row-name">📅 ${formatFrDate(e.scheduledDate)} — ${escapeHtml(e.game)} <span class="dd-pill">${findFormat(e.formatId).label}</span></div>
        <div class="dd-row-actions">${deleteBtn}</div>
      </div>`;
  });
  el.innerHTML = html;

  el.querySelectorAll('[data-action="ev-delete"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!confirm("Supprimer cet événement programmé ?")) return;
      withErrorToast(() => deleteEvent(btn.dataset.id));
    });
  });
}

// ---------------------------------------------------------------------------
// Écran Calendrier — calendrier mensuel "case classique" (grille de jours),
// accessible à tout le monde depuis l'accueil. Montre TOUS les événements
// pas encore terminés (y compris celui géré depuis l'écran Événement,
// contrairement au petit rappel ci-dessus qui l'exclut volontairement) :
// on peut cliquer sur un événement pour voir son détail, s'y inscrire à
// l'avance ("Je participe" — même mécanisme d'inscription que l'écran
// Événement, juste sur un eventId choisi plutôt que toujours l'actif, voir
// requestJoinEventGeneric ci-dessus) et voir la liste des joueurs déjà
// inscrits.
// ---------------------------------------------------------------------------
const CAL_WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const CAL_MONTH_LABELS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

function calendarDisplayedMonth() {
  const base = new Date();
  base.setDate(1);
  base.setMonth(base.getMonth() + calendarMonthOffset);
  return { year: base.getFullYear(), month: base.getMonth() }; // month: 0-11
}

function calendarDateStr(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Grille de 7×N cases (semaines commençant le lundi) : null = case vide
// (avant le 1er du mois ou après le dernier jour), sinon le numéro du jour.
function calendarBuildCells(year, month) {
  const firstOfMonth = new Date(year, month, 1);
  const jsWeekday = firstOfMonth.getDay(); // 0=dimanche..6=samedi
  const leadingBlanks = (jsWeekday + 6) % 7; // -> 0=lundi..6=dimanche
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

// Tous les événements pas encore terminés, actif compris (voir le
// commentaire au-dessus de cette section pour la différence avec
// upcomingEvents()).
function allCalendarEvents() {
  return eventsAll.filter((e) => e.status !== "termine");
}
function calendarEventsOnDate(dateStr) {
  return allCalendarEvents().filter((e) => e.scheduledDate === dateStr);
}

function calendarIsScreenActive() {
  return !!$("#view-calendar")?.classList.contains("active");
}

async function fetchCalendarParticipants(eventId) {
  calendarParticipantsLoading[eventId] = true;
  try {
    const snap = await getDocs(collection(db, "events", eventId, "participants"));
    calendarParticipantsByEventId[eventId] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error(err);
  } finally {
    delete calendarParticipantsLoading[eventId];
  }
  renderCalendarScreen();
}

// Chargement à la demande (pas d'écoute permanente, comme l'historique des
// événements) des participants de chaque événement affiché dans le
// calendrier — nécessaire pour afficher le nombre d'inscrits sur chaque
// case sans attendre un clic. Ne relance jamais un fetch déjà en cours ni
// déjà en cache pour un eventId donné.
function ensureCalendarParticipantsLoaded() {
  allCalendarEvents().forEach((e) => {
    if (!(e.id in calendarParticipantsByEventId) && !calendarParticipantsLoading[e.id]) {
      fetchCalendarParticipants(e.id);
    }
  });
}

function calendarMyParticipant(eventId) {
  const uid = myUid();
  return (calendarParticipantsByEventId[eventId] || []).find((p) => p.id === uid) || null;
}

async function requestJoinCalendarEvent(eventId, elementIds) {
  await requestJoinEventGeneric(eventId, elementIds);
  calendarJoinFormEventId = null;
  calendarJoinSelectedElementIds = [];
  showToast(isOrganizer() ? "Tu es inscrit." : "Demande d'inscription envoyée à l'organisateur.");
  await fetchCalendarParticipants(eventId); // rafraîchit tout de suite le compteur/la liste
}

function renderCalendarGrid() {
  const el = $("#calendar-grid");
  if (!el) return;

  const { year, month } = calendarDisplayedMonth();
  const cells = calendarBuildCells(year, month);
  const todayStr = localDateStr();

  let html = `
    <div class="cal-header">
      <button class="btn-mini btn-mini-ghost" type="button" id="cal-btn-prev">←</button>
      <div class="cal-month-label">${CAL_MONTH_LABELS[month]} ${year}</div>
      <button class="btn-mini btn-mini-ghost" type="button" id="cal-btn-next">→</button>
    </div>
    <div class="cal-grid">
      ${CAL_WEEKDAY_LABELS.map((w) => `<div class="cal-weekday">${w}</div>`).join("")}
  `;

  cells.forEach((day) => {
    if (day == null) {
      html += `<div class="cal-cell cal-cell-empty"></div>`;
      return;
    }
    const dateStr = calendarDateStr(year, month, day);
    const dayEvents = calendarEventsOnDate(dateStr);
    html += `<div class="cal-cell${dateStr === todayStr ? " cal-cell-today" : ""}">
      <div class="cal-cell-daynum">${day}</div>
      ${dayEvents
        .map(
          (e) =>
            `<button type="button" class="cal-chip${e.id === calendarExpandedEventId ? " cal-chip-selected" : ""}" data-action="cal-pick" data-id="${e.id}">${escapeHtml(e.game)}</button>`
        )
        .join("")}
    </div>`;
  });

  html += `</div>`;
  if (!allCalendarEvents().length) {
    html += `<p class="settings-note">Aucun tournoi programmé pour l'instant — reviens plus tard !</p>`;
  }
  el.innerHTML = html;

  $("#cal-btn-prev")?.addEventListener("click", () => {
    calendarMonthOffset -= 1;
    renderCalendarScreen();
  });
  $("#cal-btn-next")?.addEventListener("click", () => {
    calendarMonthOffset += 1;
    renderCalendarScreen();
  });
  el.querySelectorAll('[data-action="cal-pick"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      calendarExpandedEventId = btn.dataset.id;
      calendarJoinFormEventId = null;
      renderCalendarScreen();
      $("#calendar-detail")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function renderCalendarDetail() {
  const el = $("#calendar-detail");
  if (!el) return;

  const event = calendarExpandedEventId ? allCalendarEvents().find((e) => e.id === calendarExpandedEventId) : null;
  if (!event) {
    el.innerHTML = "";
    el.style.display = "none";
    return;
  }
  el.style.display = "";

  const participants = calendarParticipantsByEventId[event.id] || [];
  const registered = participants.filter((p) => p.status === "inscrit");
  const me = calendarMyParticipant(event.id);
  const isMineActive = me && ["liste_attente", "inscrit"].includes(me.status);
  const isActiveEvent = activeEvent && activeEvent.id === event.id;

  let html = `
    <h3>📅 ${formatFrDate(event.scheduledDate)} — ${escapeHtml(event.game)}</h3>
    <p class="settings-note">${findFormat(event.formatId).label} — ${event.roundMinutes} min/manche${
    isActiveEvent ? ' <span class="dd-pill">Inscriptions en cours</span>' : ""
  }</p>
  `;

  if (isMineActive) {
    html += `<p class="settings-note">${
      me.status === "inscrit" ? "✅ Tu es inscrit à ce tournoi." : "⏳ Ta demande d'inscription est en attente de validation par l'organisateur."
    }</p>`;
  } else if (event.status === "inscription") {
    html += `<button class="btn btn-primary" type="button" id="cal-btn-join">🙋 Je participe</button>`;
  }

  html += `<button class="btn-mini btn-mini-ghost" type="button" id="cal-btn-toggle-participants">${registered.length} inscrit${registered.length > 1 ? "s" : ""}</button>`;

  if (calendarShowParticipantsFor === event.id) {
    html += `<div class="manage-grid-label">Joueurs inscrits</div>`;
    if (!registered.length) {
      html += `<p class="settings-note">Personne d'inscrit pour l'instant.</p>`;
    } else {
      registered.forEach((p) => {
        html += `<div class="dd-row"><div class="dd-row-avatar" data-avatar="${p.id}"></div><div class="dd-row-name">${escapeHtml(p.pseudo)}</div></div>`;
      });
    }
  }

  const gameElements = getGameElements(event.game);
  if (calendarJoinFormEventId === event.id && gameElements.length) {
    html += `
      <div id="cal-join-elements-wrap">${elementsPickerHtml(event.game, calendarJoinSelectedElementIds)}</div>
      <button class="btn btn-primary" type="button" id="cal-btn-join-confirm">Confirmer l'inscription</button>
      <button class="btn btn-ghost" type="button" id="cal-btn-join-cancel">Annuler</button>
    `;
  }

  el.innerHTML = html;

  if (calendarShowParticipantsFor === event.id) {
    registered.forEach((p) => {
      const holder = el.querySelector(`[data-avatar="${p.id}"]`);
      if (holder) renderAvatar(holder, p, 34);
    });
  }

  $("#cal-btn-toggle-participants")?.addEventListener("click", () => {
    calendarShowParticipantsFor = calendarShowParticipantsFor === event.id ? null : event.id;
    renderCalendarScreen();
  });

  $("#cal-btn-join")?.addEventListener("click", () => {
    if (!gameElements.length) {
      withErrorToast(() => requestJoinCalendarEvent(event.id, []));
      return;
    }
    calendarJoinFormEventId = event.id;
    calendarJoinSelectedElementIds = [];
    renderCalendarScreen();
  });

  if (calendarJoinFormEventId === event.id && gameElements.length) {
    wireElementsPicker($("#cal-join-elements-wrap"), calendarJoinSelectedElementIds);
    $("#cal-btn-join-confirm")?.addEventListener("click", () => {
      if (!calendarJoinSelectedElementIds.length) {
        showToast("Choisis au moins un élément pour ton deck.", true);
        return;
      }
      withErrorToast(() => requestJoinCalendarEvent(event.id, calendarJoinSelectedElementIds.slice()));
    });
    $("#cal-btn-join-cancel")?.addEventListener("click", () => {
      calendarJoinFormEventId = null;
      renderCalendarScreen();
    });
  }
}

function renderCalendarScreen() {
  if (!calendarIsScreenActive()) return;
  ensureCalendarParticipantsLoaded();
  renderCalendarGrid();
  renderCalendarDetail();
}

export function showCalendarScreen() {
  hideAllViews();
  $("#view-calendar")?.classList.add("active");
  startListening();
  calendarMonthOffset = 0;
  renderCalendarScreen();
}
function closeCalendarScreen() {
  hideAllViews();
  $("#view-app")?.classList.add("active");
  stopListening();
  calendarExpandedEventId = null;
  calendarJoinFormEventId = null;
  calendarJoinSelectedElementIds = [];
  calendarShowParticipantsFor = null;
  // Les compteurs/listes d'inscrits sont chargés à la demande (pas de
  // onSnapshot dédié, voir ensureCalendarParticipantsLoaded) : on vide le
  // cache à la fermeture pour forcer un rechargement à jour à la prochaine
  // ouverture, plutôt que de risquer d'afficher un nombre d'inscrits périmé
  // (ex. des joueurs validés par l'organisateur depuis la dernière visite).
  calendarParticipantsByEventId = {};
  calendarParticipantsLoading = {};
}

// ---------------------------------------------------------------------------
// Rendu global + navigation
// ---------------------------------------------------------------------------
function render() {
  renderEventOrganizerPanel();
  renderEventPlayerArea();
  renderEventCalendarPanel();
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
  $("#btn-open-calendar")?.addEventListener("click", showCalendarScreen);
  $("#btn-close-calendar")?.addEventListener("click", closeCalendarScreen);
});
