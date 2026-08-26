// ============================================================================
// Car'Tech Arena — "Duel du jour"
// Session en direct : présence en boutique, propositions de duel, résultats
// validés en double, panneau organisateur (validation / exclusion).
// ============================================================================
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  collection,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import { db } from "./firebase-init.js";
import { $, getCurrentProfile, getCurrentUid, renderProfile, showToast, friendlyError, renderAvatar, hideAllViews, openPlayerProfileModal } from "./app.js";
import { FORMATS, findFormat } from "./catalog.js";
import {
  getAllGames,
  getGameWinCondition,
  winConditionLabel,
  getGameElements,
  elementsPickerHtml,
  wireElementsPicker,
  elementIconsHtml,
  findReferralRewardTag,
} from "./live-catalog.js";
import { showSeasonScreen } from "./season.js";

// Toute action Firestore peut échouer (règles de sécurité, réseau...) — on
// affiche toujours une erreur lisible plutôt que de laisser planter en
// silence, ce qui aurait laissé l'écran figé sans aucune explication.
async function withErrorToast(fn) {
  try {
    await fn();
  } catch (err) {
    console.error(err);
    showToast(friendlyError(err), true);
  }
}

const SESSION_ID = "current";
const sessionRef = doc(db, "dailySession", SESSION_ID);
const participantsCol = collection(db, "dailySession", SESSION_ID, "participants");
const duelsCol = collection(db, "dailySession", SESSION_ID, "duels");

// ---------------------------------------------------------------------------
// État local (rempli en direct par les écouteurs onSnapshot)
// ---------------------------------------------------------------------------
let session = null; // { status: 'ouvert'|'ferme', endTime, openedAt, openedBy }
let participants = []; // [{ id, uid, pseudo, photoDataUrl, decorations, status }]
let duels = []; // [{ id, fromUid, fromPseudo, toUid, toPseudo, game, format, status, resultFrom, resultTo }]
let unsubscribers = [];
let listening = false;

// Petite mémoire d'écran : quel joueur est ciblé par "Proposer un duel" en ce
// moment (affiche le formulaire de proposition en dessous de sa carte).
let proposingToUid = null;

// Éléments de deck cochés en train de proposer/accepter un duel (voir
// elementsPickerHtml dans live-catalog.js) — vidés à chaque nouvelle
// proposition/réception pour ne jamais garder la sélection d'un duel
// précédent.
let proposeSelectedElementIds = [];
let acceptSelectedElementIds = [];
let lastIncomingDuelId = null;

// Duel qui vient tout juste de se terminer (recap avec les decks révélés,
// affiché jusqu'à ce que le joueur le ferme) — voir revealFinishedDuel.
let justFinishedDuel = null; // { duel, myElements, oppElements } | null
let duelsLoadedOnce = false;

// IDs de duels déjà traités pour la détection "vient de se terminer" —
// indispensable en plus de la simple comparaison next-vs-duels ci-dessous :
// maybeGrantReferralReward() écrit sur users/{uid}, ce qui redéclenche CE
// MÊME écouteur onSnapshot (le mock de test notifie tous les écouteurs à
// chaque écriture, de façon synchrone et réentrante) AVANT que "duels" ait pu
// être réassigné à "next" plus bas — sans ce garde-fou, la comparaison
// retrouve indéfiniment le même duel "juste terminé" et rappelle
// maybeGrantReferralReward en boucle synchrone jusqu'au débordement de pile.
const handledFinishedDuelIds = new Set();

function isOrganizer() {
  return getCurrentProfile()?.role === "organisateur";
}
function myUid() {
  return getCurrentUid();
}
function myParticipant() {
  const uid = myUid();
  return participants.find((p) => p.id === uid) || null;
}
function activeDuelUids() {
  const s = new Set();
  duels.forEach((d) => {
    if (d.status === "en_cours" || d.status === "litige") {
      s.add(d.fromUid);
      s.add(d.toUid);
    }
  });
  return s;
}
function myActiveDuel() {
  const uid = myUid();
  return (
    duels.find(
      (d) => (d.fromUid === uid || d.toUid === uid) && (d.status === "en_cours" || d.status === "litige")
    ) || null
  );
}
function myIncomingProposals() {
  const uid = myUid();
  return duels.filter((d) => d.toUid === uid && d.status === "proposition");
}
function myOutgoingProposal(targetUid) {
  const uid = myUid();
  return duels.find((d) => d.fromUid === uid && d.toUid === targetUid && d.status === "proposition");
}

// ---------------------------------------------------------------------------
// Écouteurs temps réel — démarrés à l'ouverture de l'écran, arrêtés à la
// fermeture (pour ne pas laisser tourner des listeners inutiles en fond).
// ---------------------------------------------------------------------------
function startListening() {
  if (listening) return;
  listening = true;

  unsubscribers.push(
    onSnapshot(sessionRef, (snap) => {
      session = snap.exists() ? snap.data() : null;
      render();
    })
  );
  unsubscribers.push(
    onSnapshot(participantsCol, (snap) => {
      participants = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      render();
    })
  );
  unsubscribers.push(
    onSnapshot(duelsCol, (snap) => {
      const next = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      // Détecte un duel qui vient tout juste de passer à "termine" et qui me
      // concerne, pour proposer le récapitulatif avec les decks révélés
      // (voir revealFinishedDuel) — ignoré au tout premier chargement
      // (duelsLoadedOnce), sinon un duel déjà terminé depuis un moment
      // déclencherait à tort le récap à chaque ouverture de l'écran.
      if (duelsLoadedOnce) {
        const uid = myUid();
        const finishedNow = next.find((d) => {
          if (d.status !== "termine" || (d.fromUid !== uid && d.toUid !== uid)) return false;
          if (handledFinishedDuelIds.has(d.id)) return false;
          const prev = duels.find((p) => p.id === d.id);
          return !prev || prev.status !== "termine";
        });
        if (finishedNow) {
          handledFinishedDuelIds.add(finishedNow.id);
          revealFinishedDuel(finishedNow);
          // "duels" (l'ancien tableau, pas encore réassigné plus bas) sert à
          // savoir si c'était mon tout premier duel du jour jamais terminé —
          // voir maybeGrantReferralReward.
          maybeGrantReferralReward(duels, uid);
        }
      }
      duelsLoadedOnce = true;
      duels = next;
      render();
    })
  );
}

function stopListening() {
  unsubscribers.forEach((u) => u());
  unsubscribers = [];
  listening = false;
}

// ---------------------------------------------------------------------------
// Actions — organisateur
// ---------------------------------------------------------------------------
async function openSession() {
  const endTimeInput = $("#dd-endtime").value; // "HH:MM" ou vide
  let endTime = null;
  if (endTimeInput) {
    const now = new Date();
    const [h, m] = endTimeInput.split(":").map(Number);
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0);
    endTime = target.toISOString();
  }
  await setDoc(sessionRef, {
    status: "ouvert",
    endTime,
    openedAt: serverTimestamp(),
    openedBy: myUid(),
  });
  showToast("Session « Duel du jour » ouverte !");
}

async function closeSession() {
  // Fermer la session ("boutique fermée pour la soirée") ne suffisait pas à
  // faire disparaître un joueur encore marqué "disponible" (ou "en attente
  // de validation") au moment de la fermeture — rien ne repassait son statut
  // à "parti", donc il restait affiché "Disponible" sur l'écran d'accueil de
  // tout le monde indéfiniment, même déconnecté, jusqu'à ce qu'il clique
  // lui-même sur "Quitter le duel du jour" (ce que personne ne pense à faire
  // une fois la boutique fermée). On referme donc aussi, dans la même
  // action, tous les participants encore "présents" ou "en attente".
  const toClose = participants.filter((p) => ["disponible", "attente_validation"].includes(p.status));
  await Promise.all(toClose.map((p) => updateDoc(doc(participantsCol, p.id), { status: "parti" })));
  await updateDoc(sessionRef, { status: "ferme" });
  showToast("Session fermée.");
}

async function validateJoin(participantId) {
  await updateDoc(doc(participantsCol, participantId), { status: "disponible" });
}
async function rejectJoin(participantId) {
  await updateDoc(doc(participantsCol, participantId), { status: "refuse" });
}
async function kickParticipant(participantId) {
  await updateDoc(doc(participantsCol, participantId), { status: "exclu" });
  showToast("Joueur exclu de la session.");
}

// ---------------------------------------------------------------------------
// Actions — joueur
// ---------------------------------------------------------------------------
async function requestJoin() {
  const profile = getCurrentProfile();
  const uid = myUid();
  const data = {
    uid,
    pseudo: profile.pseudo,
    photoDataUrl: profile.photoDataUrl || null,
    decorations: profile.decorations || { owned: [], active: null },
    status: isOrganizer() ? "disponible" : "attente_validation",
    joinedAt: serverTimestamp(),
  };
  await setDoc(doc(participantsCol, uid), data);
  showToast(isOrganizer() ? "Tu es marqué disponible." : "Demande envoyée à l'organisateur.");
}

async function leaveSession() {
  const uid = myUid();
  await updateDoc(doc(participantsCol, uid), { status: "parti" });
  proposingToUid = null;
  showToast("Tu as quitté le duel du jour.");
}

// Deck déclaré par un joueur pour un duel — document à part, jamais
// modifiable une fois créé, caché à l'adversaire tant que le duel n'est
// pas "termine" (voir le long commentaire dans firestore.rules). Facultatif
// : ne s'applique que si le jeu du duel a des éléments configurés.
function deckDocRef(duelId, uid) {
  return doc(db, "dailySession", SESSION_ID, "duels", duelId, "decks", uid);
}
async function declareDeck(duelId, elements) {
  await setDoc(deckDocRef(duelId, myUid()), { elements });
}
async function fetchDeck(duelId, uid) {
  const snap = await getDoc(deckDocRef(duelId, uid));
  return snap.exists() ? snap.data().elements : null;
}

async function proposeDuel(targetUid) {
  const game = $("#dd-propose-game")?.value;
  const formatId = $("#dd-propose-format")?.value;
  if (!game || !formatId) return;
  const gameElements = getGameElements(game);
  if (gameElements.length && !proposeSelectedElementIds.length) {
    showToast("Choisis au moins un élément pour ton deck.", true);
    return;
  }
  const me = getCurrentProfile();
  const target = participants.find((p) => p.id === targetUid);
  const ref = await addDoc(duelsCol, {
    fromUid: myUid(),
    fromPseudo: me.pseudo,
    toUid: targetUid,
    toPseudo: target?.pseudo || "",
    game,
    format: formatId,
    status: "proposition",
    resultFrom: null,
    resultTo: null,
    createdAt: serverTimestamp(),
  });
  if (gameElements.length) {
    await declareDeck(ref.id, proposeSelectedElementIds.slice());
  }
  proposingToUid = null;
  proposeSelectedElementIds = [];
  showToast("Proposition envoyée !");
}

async function acceptProposal(duelId, game) {
  const gameElements = getGameElements(game);
  if (gameElements.length && !acceptSelectedElementIds.length) {
    showToast("Choisis au moins un élément pour ton deck.", true);
    return;
  }
  if (gameElements.length) {
    await declareDeck(duelId, acceptSelectedElementIds.slice());
  }
  await updateDoc(doc(duelsCol, duelId), { status: "en_cours" });
  acceptSelectedElementIds = [];
}
async function declineProposal(duelId) {
  await updateDoc(doc(duelsCol, duelId), { status: "refuse" });
}

// Récapitulatif affiché juste après la fin d'un duel qui me concerne — les
// deux decks ne sont récupérables (côté serveur) qu'à partir de maintenant,
// le duel étant "termine" (voir fetchDeck / firestore.rules). Ne fait rien
// si le jeu du duel n'a aucun élément configuré (rien à révéler).
async function revealFinishedDuel(duel) {
  const gameElements = getGameElements(duel.game);
  if (!gameElements.length) return;
  const uid = myUid();
  const oppUid = duel.fromUid === uid ? duel.toUid : duel.fromUid;
  const [myElements, oppElements] = await Promise.all([
    fetchDeck(duel.id, uid).catch(() => null),
    fetchDeck(duel.id, oppUid).catch(() => null),
  ]);
  justFinishedDuel = { duel, myElements, oppElements };
  render();
}

// ---------------------------------------------------------------------------
// Système de parrainage : dès que MON tout premier duel du jour jamais
// terminé (tous comptes/toutes soirées confondus, pas juste aujourd'hui)
// vient de se conclure, et que j'ai un parrain enregistré (voir la modale
// d'inscription dans app.js) pas encore récompensé, les DEUX comptes
// reçoivent le tag marqué "récompense de parrainage" par l'organisateur
// (voir isValidSelfReferralTagGrant/isValidCrossReferralGrant dans
// firestore.rules pour la contre-vérification côté serveur). Sans effet si
// l'organisateur n'a pas encore créé/marqué ce tag — comme les autres
// catalogues pas encore configurés dans cette appli.
// ---------------------------------------------------------------------------
function priorFinishedDuelsCount(oldDuels, uid) {
  return (oldDuels || []).filter(
    (d) => d.status === "termine" && (d.fromUid === uid || d.toUid === uid)
  ).length;
}

async function maybeGrantReferralReward(oldDuels, uid) {
  const profile = getCurrentProfile();
  if (!profile) return;
  const referredByUid = profile.referral?.referredByUid || null;
  if (!referredByUid || profile.referral?.rewardGranted) return;
  if (priorFinishedDuelsCount(oldDuels, uid) > 0) return; // pas mon 1er duel
  const tag = findReferralRewardTag();
  if (!tag) return;
  try {
    await updateDoc(doc(db, "users", uid), {
      "tags.owned": arrayUnion(tag.id),
      "referral.rewardGranted": true,
    });
    await updateDoc(doc(db, "users", referredByUid), { "tags.owned": arrayUnion(tag.id) });
    const updated = {
      ...profile,
      tags: { ...profile.tags, owned: [...(profile.tags?.owned || []), tag.id] },
      referral: { ...profile.referral, rewardGranted: true },
    };
    renderProfile(updated);
    showToast(`🎁 Tag « ${tag.name} » débloqué pour toi et ton parrain !`);
  } catch (err) {
    // Pas grave si ça échoue (ex. tag supprimé entre-temps par
    // l'organisateur, ou parrain supprimé) — comme pour le tag de saison
    // (voir maybeGrantSeasonTag dans season.js), c'est purement cosmétique.
    console.error(err);
  }
}

function renderFinishedDuelRecap({ duel, myElements, oppElements }) {
  const uid = myUid();
  const iAmFrom = duel.fromUid === uid;
  const oppPseudo = iAmFrom ? duel.toPseudo : duel.fromPseudo;
  const myResult = iAmFrom ? duel.resultFrom : duel.resultTo;
  const won = myResult?.iWon;
  return `
    <div class="dd-notif">
      <h3>${won ? "🏆" : "💔"} Duel terminé contre ${escapeHtml(oppPseudo)}</h3>
      ${myResult ? `<p class="settings-note">${won ? "Victoire" : "Défaite"} (${myResult.myScore} - ${myResult.oppScore})</p>` : ""}
      <p class="settings-note">Ton deck : ${elementIconsHtml(duel.game, myElements)}</p>
      <p class="settings-note">Deck de ${escapeHtml(oppPseudo)} : ${elementIconsHtml(duel.game, oppElements)}</p>
      <button class="btn btn-ghost" type="button" id="dd-btn-close-recap">Fermer</button>
    </div>
  `;
}

async function submitResult(duel, myScore, oppScore, iWon) {
  const uid = myUid();
  const myResult = { myScore, oppScore, iWon };
  const field = duel.fromUid === uid ? "resultFrom" : "resultTo";
  const otherResult = duel.fromUid === uid ? duel.resultTo : duel.resultFrom;

  const matches =
    otherResult != null &&
    myResult.myScore === otherResult.oppScore &&
    myResult.oppScore === otherResult.myScore &&
    myResult.iWon === !otherResult.iWon;

  const nextStatus = matches ? "termine" : otherResult == null ? "en_cours" : "litige";

  await updateDoc(doc(duelsCol, duel.id), {
    [field]: myResult,
    status: nextStatus,
    // Horodatage du moment où le duel est VALIDÉ (les deux résultats
    // concordent), pas de sa proposition — utilisé par js/season.js pour
    // savoir à quelle journée/saison rattacher les points gagnés. Absent
    // tant que le duel n'est pas "termine".
    ...(nextStatus === "termine" ? { resolvedAt: serverTimestamp() } : {}),
  });
}

// ---------------------------------------------------------------------------
// Rendu — panneau organisateur
// ---------------------------------------------------------------------------
function renderOrganizerPanel() {
  const el = $("#dd-organizer-panel");
  if (!el) return;
  if (!isOrganizer()) {
    el.style.display = "none";
    return;
  }
  el.style.display = "";

  const preserved = captureInputs(["dd-endtime"]);
  const isOpen = session?.status === "ouvert";
  const pending = participants.filter((p) => p.status === "attente_validation");
  const roster = participants.filter((p) =>
    ["attente_validation", "disponible"].includes(p.status)
  );

  let html = `<h3>🛡️ Organisateur — Duel du jour</h3>`;

  if (!isOpen) {
    html += `
      <label for="dd-endtime">Heure de fin (optionnel)</label>
      <input type="time" id="dd-endtime">
      <button class="btn btn-primary" type="button" id="dd-btn-open">Ouvrir la session</button>
    `;
  } else {
    html += `
      <p class="settings-note">Session ouverte${session.endTime ? ` — jusqu'à ${new Date(session.endTime).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : ""}.</p>
      <button class="btn btn-danger" type="button" id="dd-btn-close">Fermer la session</button>
    `;

    if (pending.length) {
      html += `<div class="manage-grid-label">Demandes en attente</div>`;
      pending.forEach((p) => {
        html += `
          <div class="dd-row" data-uid="${p.id}">
            <div class="dd-row-avatar" data-avatar="${p.id}"></div>
            <div class="dd-row-name">${escapeHtml(p.pseudo)}</div>
            <div class="dd-row-actions">
              <button class="btn-mini btn-mini-ok" data-action="validate" data-uid="${p.id}">✅</button>
              <button class="btn-mini btn-mini-no" data-action="reject" data-uid="${p.id}">❌</button>
            </div>
          </div>`;
      });
    }

    if (roster.length) {
      html += `<div class="manage-grid-label">Joueurs présents</div>`;
      roster.forEach((p) => {
        const statusLabel = STATUS_LABELS[p.status] || p.status;
        html += `
          <div class="dd-row" data-uid="${p.id}">
            <div class="dd-row-avatar" data-avatar="${p.id}"></div>
            <div class="dd-row-name">${escapeHtml(p.pseudo)} <span class="dd-pill">${statusLabel}</span></div>
            <div class="dd-row-actions">
              <button class="btn-mini btn-mini-no" data-action="kick" data-uid="${p.id}">Exclure</button>
            </div>
          </div>`;
      });
    } else {
      html += `<p class="settings-note">Personne dans la session pour l'instant.</p>`;
    }
  }

  el.innerHTML = html;

  if (!isOpen) {
    $("#dd-btn-open")?.addEventListener("click", () => withErrorToast(openSession));
  } else {
    $("#dd-btn-close")?.addEventListener("click", () => withErrorToast(closeSession));
    el.querySelectorAll('[data-action="validate"]').forEach((btn) =>
      btn.addEventListener("click", () => withErrorToast(() => validateJoin(btn.dataset.uid)))
    );
    el.querySelectorAll('[data-action="reject"]').forEach((btn) =>
      btn.addEventListener("click", () => withErrorToast(() => rejectJoin(btn.dataset.uid)))
    );
    el.querySelectorAll('[data-action="kick"]').forEach((btn) =>
      btn.addEventListener("click", () => withErrorToast(() => kickParticipant(btn.dataset.uid)))
    );
    // avatars
    [...pending, ...roster].forEach((p) => {
      const holder = el.querySelector(`[data-avatar="${p.id}"]`);
      if (holder) renderAvatar(holder, p, 38);
    });
  }

  restoreInputs(preserved);
}

// ---------------------------------------------------------------------------
// Préservation des champs en cours de saisie face aux mises à jour en direct
// ---------------------------------------------------------------------------
// Les écrans se reconstruisent entièrement (innerHTML) à chaque mise à jour
// venant de Firestore — y compris pendant qu'un joueur est en train de
// remplir un formulaire (ex: l'adversaire envoie son résultat pendant qu'on
// écrit le nôtre). Sans ça, la saisie en cours serait effacée et il faudrait
// tout retaper. On capture donc les valeurs juste avant de reconstruire le
// HTML, puis on les réinjecte juste après si les mêmes champs réapparaissent.
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

const STATUS_LABELS = {
  attente_validation: "⏳ en attente",
  disponible: "🟢 disponible",
  refuse: "❌ refusé",
  exclu: "🚫 exclu",
  parti: "🚪 parti",
};

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

// ---------------------------------------------------------------------------
// Rendu — carte joueur (mon état dans la session)
// ---------------------------------------------------------------------------
function renderPlayerArea() {
  const el = $("#dd-player-area");
  if (!el) return;

  if (!session || session.status !== "ouvert") {
    el.innerHTML = `<p class="settings-note">Aucune session « Duel du jour » n'est ouverte pour le moment. Reviens quand l'organisateur en aura lancé une !</p>`;
    return;
  }

  const me = myParticipant();

  if (!me || me.status === "refuse" || me.status === "exclu" || me.status === "parti") {
    let msg = "Rejoins le « Duel du jour » pour affronter les autres joueurs présents en boutique ce soir.";
    if (me?.status === "refuse") msg = "Ta demande a été refusée par l'organisateur.";
    if (me?.status === "exclu") msg = "Tu as été retiré de la session par l'organisateur.";
    if (me?.status === "parti") msg = "Tu as quitté la session.";
    el.innerHTML = `
      <p class="settings-note">${msg}</p>
      <button class="btn btn-primary" type="button" id="dd-btn-join">Demande à rejoindre</button>
    `;
    $("#dd-btn-join")?.addEventListener("click", () => withErrorToast(requestJoin));
    return;
  }

  if (me.status === "attente_validation") {
    el.innerHTML = `
      <p class="settings-note">⏳ En attente de validation par l'organisateur…</p>
      <button class="btn btn-ghost" type="button" id="dd-btn-leave">Quitter le duel du jour</button>
    `;
    $("#dd-btn-leave")?.addEventListener("click", () => withErrorToast(leaveSession));
    return;
  }

  // status === "disponible" à partir d'ici
  const activeDuel = myActiveDuel();
  const incoming = myIncomingProposals();

  const preserved = captureInputs(["dd-my-score", "dd-opp-score", "dd-i-won", "dd-propose-game", "dd-propose-format"]);

  let html = "";

  if (activeDuel) {
    justFinishedDuel = null;
    html += renderActiveDuelCard(activeDuel);
  } else if (incoming.length) {
    if (lastIncomingDuelId !== incoming[0].id) {
      lastIncomingDuelId = incoming[0].id;
      acceptSelectedElementIds = [];
    }
    html += renderIncomingProposalCard(incoming[0]);
  } else {
    if (justFinishedDuel) html += renderFinishedDuelRecap(justFinishedDuel);
    html += renderAvailableList();
  }

  html += `<button class="btn btn-ghost" type="button" id="dd-btn-leave">Quitter le duel du jour</button>`;
  el.innerHTML = html;
  $("#dd-btn-leave")?.addEventListener("click", () => withErrorToast(leaveSession));
  wireAvailableListEvents();
  wireIncomingProposalEvents(incoming[0]);
  wireActiveDuelEvents(activeDuel);
  restoreInputs(preserved);
  updateProposeWcInfo();
}

function availableOthers() {
  const busy = activeDuelUids();
  const uid = myUid();
  return participants.filter((p) => p.status === "disponible" && p.id !== uid && !busy.has(p.id));
}

function renderAvailableList() {
  const others = availableOthers();

  let html = `<h3>Joueurs disponibles</h3>`;
  if (!others.length) {
    html += `<p class="settings-note">Personne d'autre n'est disponible pour l'instant.</p>`;
  }
  others.forEach((p) => {
    const outgoing = myOutgoingProposal(p.id);
    html += `
      <div class="dd-row" data-uid="${p.id}">
        <div class="dd-row-avatar" data-avatar="${p.id}"></div>
        <div class="dd-row-name">${escapeHtml(p.pseudo)}</div>
        <div class="dd-row-actions">
          <button class="btn-mini btn-mini-ghost" data-action="view-profile" data-uid="${p.id}">Voir profil</button>
          ${
            outgoing
              ? `<span class="dd-pill">⏳ en attente</span>`
              : `<button class="btn-mini" data-action="propose" data-uid="${p.id}">Proposer duel</button>`
          }
        </div>
      </div>
      ${proposingToUid === p.id ? renderProposeForm(p) : ""}
    `;
  });
  return html;
}

function proposeGameWcInfoHtml(game) {
  const wc = getGameWinCondition(game);
  return wc ? `<p class="settings-note" id="dd-propose-wc-info">🎯 ${escapeHtml(winConditionLabel(wc))}</p>` : `<p class="settings-note" id="dd-propose-wc-info"></p>`;
}

function renderProposeForm(target) {
  const games = getAllGames();
  const gameOptions = games.map((g) => `<option value="${g}">${g}</option>`).join("");
  const formatOptions = FORMATS.map((f) => `<option value="${f.id}">${f.label}</option>`).join("");
  return `
    <div class="dd-propose-form">
      <label for="dd-propose-game">Jeu</label>
      <select id="dd-propose-game">${gameOptions}</select>
      ${proposeGameWcInfoHtml(games[0])}
      <label for="dd-propose-format">Format</label>
      <select id="dd-propose-format">${formatOptions}</select>
      <div id="dd-propose-elements-wrap">${elementsPickerHtml(games[0], proposeSelectedElementIds)}</div>
      <button class="btn btn-primary" type="button" id="dd-btn-send-proposal">Envoyer la proposition à ${escapeHtml(target.pseudo)}</button>
    </div>
  `;
}

function renderIncomingProposalCard(duel) {
  const format = findFormat(duel.format);
  return `
    <div class="dd-notif">
      <h3>⚔️ Proposition de duel !</h3>
      <p><b>${escapeHtml(duel.fromPseudo)}</b> te propose un duel : ${escapeHtml(duel.game)} — ${format.label}.</p>
      <div id="dd-accept-elements-wrap">${elementsPickerHtml(duel.game, acceptSelectedElementIds)}</div>
      <div class="modal-actions">
        <button class="btn btn-ghost" type="button" id="dd-btn-decline">Refuser</button>
        <button class="btn btn-primary" type="button" id="dd-btn-accept">Accepter</button>
      </div>
    </div>
  `;
}

function renderActiveDuelCard(duel) {
  const uid = myUid();
  const iAmFrom = duel.fromUid === uid;
  const myResult = iAmFrom ? duel.resultFrom : duel.resultTo;
  const oppPseudo = iAmFrom ? duel.toPseudo : duel.fromPseudo;
  const format = findFormat(duel.format);

  let litigeNote = "";
  if (duel.status === "litige") {
    litigeNote = `<p class="dd-error">⚠️ Vos résultats ne concordent pas — corrigez et renvoyez.</p>`;
  }

  const wc = getGameWinCondition(duel.game);
  const wcNote = wc ? `<p class="settings-note">🎯 ${escapeHtml(winConditionLabel(wc))}</p>` : "";

  if (myResult) {
    const sentLabel = wc?.type === "point_defaite" ? "Vie restante envoyée" : "Ton résultat envoyé";
    return `
      <div class="dd-notif">
        <h3>⚔️ Duel en cours contre ${escapeHtml(oppPseudo)}</h3>
        <p class="settings-note">${escapeHtml(duel.game)} — ${format.label}</p>
        ${wcNote}
        ${litigeNote}
        <p class="settings-note">${sentLabel} : ${myResult.myScore} - ${myResult.oppScore}, ${myResult.iWon ? "victoire" : "défaite"}. En attente de ${escapeHtml(oppPseudo)}…</p>
        <button class="btn btn-ghost" type="button" id="dd-btn-edit-result">Corriger mon résultat</button>
      </div>
    `;
  }

  return `
    <div class="dd-notif">
      <h3>⚔️ Duel en cours contre ${escapeHtml(oppPseudo)}</h3>
      <p class="settings-note">${escapeHtml(duel.game)} — ${format.label}</p>
      ${wcNote}
      ${litigeNote}
      ${renderResultForm(wc)}
    </div>
  `;
}

// Les libellés changent selon le type de condition de victoire du jeu :
// pour "point_defaite" (points de vie de départ), on demande explicitement
// la vie RESTANTE de chacun à la fin du duel (0 pour celui qui est éliminé)
// — c'est ce que season.js utilise ensuite pour calculer les dégâts
// infligés par chacun (voir computeSeasonStandings). Pour "point_maximal"
// (ou aucune condition définie), on garde les libellés génériques d'origine.
function renderResultForm(wc) {
  const isLifePoints = wc?.type === "point_defaite";
  const myLabel = isLifePoints ? "Tes points de vie restants (0 si éliminé)" : "Ton score";
  const oppLabel = isLifePoints ? "Points de vie restants de l'adversaire" : "Score de l'adversaire";
  return `
    <form id="dd-result-form">
      <label for="dd-my-score">${myLabel}</label>
      <input type="number" id="dd-my-score" min="0" required>
      <label for="dd-opp-score">${oppLabel}</label>
      <input type="number" id="dd-opp-score" min="0" required>
      <label><input type="checkbox" id="dd-i-won" style="width:auto;display:inline-block;"> J'ai gagné</label>
      <button class="btn btn-primary" type="submit">Valider mon résultat</button>
    </form>
  `;
}

function updateProposeWcInfo() {
  const select = $("#dd-propose-game");
  const info = $("#dd-propose-wc-info");
  if (!select || !info) return;
  const wc = getGameWinCondition(select.value);
  info.textContent = wc ? `🎯 ${winConditionLabel(wc)}` : "";
}

// Rejoue le sélecteur d'éléments quand le jeu choisi change — la sélection
// précédente ne veut plus rien dire pour un autre jeu, donc on repart de
// zéro (contrairement à un simple clic sur un élément, qui ne redessine
// rien — voir wireElementsPicker dans live-catalog.js).
function refreshProposeElementsPicker() {
  const wrap = $("#dd-propose-elements-wrap");
  if (!wrap) return;
  proposeSelectedElementIds = [];
  wrap.innerHTML = elementsPickerHtml($("#dd-propose-game")?.value, proposeSelectedElementIds);
  wireElementsPicker(wrap, proposeSelectedElementIds);
}

function wireAvailableListEvents() {
  document.querySelectorAll('[data-action="propose"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      proposingToUid = proposingToUid === btn.dataset.uid ? null : btn.dataset.uid;
      proposeSelectedElementIds = [];
      render();
    });
  });
  document.querySelectorAll('[data-action="view-profile"]').forEach((btn) => {
    btn.addEventListener("click", () => openPlayerProfileModal(btn.dataset.uid));
  });
  $("#dd-btn-send-proposal")?.addEventListener("click", () => withErrorToast(() => proposeDuel(proposingToUid)));
  $("#dd-propose-game")?.addEventListener("change", () => {
    updateProposeWcInfo();
    refreshProposeElementsPicker();
  });
  wireElementsPicker($("#dd-propose-elements-wrap"), proposeSelectedElementIds);
  updateProposeWcInfo();
  $("#dd-btn-close-recap")?.addEventListener("click", () => {
    justFinishedDuel = null;
    render();
  });

  // Photos de profil des joueurs disponibles (pas encore affichées tant que
  // ces lignes n'existent pas dans le DOM, d'où l'appel ici plutôt qu'au
  // moment de générer le HTML).
  availableOthers().forEach((p) => {
    const holder = document.querySelector(`.dd-row[data-uid="${p.id}"] [data-avatar="${p.id}"]`);
    if (holder) renderAvatar(holder, p, 40);
  });
}

function wireIncomingProposalEvents(duel) {
  if (!duel) return;
  wireElementsPicker($("#dd-accept-elements-wrap"), acceptSelectedElementIds);
  $("#dd-btn-accept")?.addEventListener("click", () => withErrorToast(() => acceptProposal(duel.id, duel.game)));
  $("#dd-btn-decline")?.addEventListener("click", () => withErrorToast(() => declineProposal(duel.id)));
}

function wireActiveDuelEvents(duel) {
  if (!duel) return;
  $("#dd-btn-edit-result")?.addEventListener("click", () =>
    withErrorToast(async () => {
      const uid = myUid();
      const field = duel.fromUid === uid ? "resultFrom" : "resultTo";
      await updateDoc(doc(duelsCol, duel.id), { [field]: null });
    })
  );
  $("#dd-result-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const myScore = Number($("#dd-my-score").value);
    const oppScore = Number($("#dd-opp-score").value);
    const iWon = $("#dd-i-won").checked;
    withErrorToast(() => submitResult(duel, myScore, oppScore, iWon));
  });
}

// ---------------------------------------------------------------------------
// Rendu global + navigation
// ---------------------------------------------------------------------------
function render() {
  renderOrganizerPanel();
  renderPlayerArea();
}

export function showDailyDuelScreen() {
  hideAllViews();
  $("#view-daily-duel")?.classList.add("active");
  startListening();
}

function closeDailyDuelScreen() {
  hideAllViews();
  $("#view-app")?.classList.add("active");
  stopListening();
  proposingToUid = null;
}

document.addEventListener("DOMContentLoaded", () => {
  $("#btn-open-daily-duel")?.addEventListener("click", showDailyDuelScreen);
  $("#btn-close-daily-duel")?.addEventListener("click", closeDailyDuelScreen);
  // Raccourci vers "Saison actuelle" directement depuis le Duel du jour — on
  // arrête bien les écouteurs du Duel du jour avant de partir (comme le fait
  // "Retour"), pour ne pas les laisser tourner inutilement en fond pendant
  // qu'on consulte la saison.
  $("#btn-daily-duel-open-season")?.addEventListener("click", () => {
    stopListening();
    proposingToUid = null;
    showSeasonScreen();
  });
});
