// ============================================================================
// Car'Tech Arena — "Duel du jour"
// Session en direct : présence en boutique, propositions de duel, résultats
// validés en double, panneau organisateur (validation / exclusion).
// ============================================================================
import {
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  collection,
  onSnapshot,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import { db } from "./firebase-init.js";
import { $, getCurrentProfile, getCurrentUid, showToast, friendlyError, renderAvatar, hideAllViews, openPlayerProfileModal } from "./app.js";
import { FORMATS, findFormat } from "./catalog.js";
import { getAllGames } from "./live-catalog.js";

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
      duels = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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

async function proposeDuel(targetUid) {
  const game = $("#dd-propose-game")?.value;
  const formatId = $("#dd-propose-format")?.value;
  if (!game || !formatId) return;
  const me = getCurrentProfile();
  const target = participants.find((p) => p.id === targetUid);
  await addDoc(duelsCol, {
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
  proposingToUid = null;
  showToast("Proposition envoyée !");
}

async function acceptProposal(duelId) {
  await updateDoc(doc(duelsCol, duelId), { status: "en_cours" });
}
async function declineProposal(duelId) {
  await updateDoc(doc(duelsCol, duelId), { status: "refuse" });
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
    html += renderActiveDuelCard(activeDuel);
  } else if (incoming.length) {
    html += renderIncomingProposalCard(incoming[0]);
  } else {
    html += renderAvailableList();
  }

  html += `<button class="btn btn-ghost" type="button" id="dd-btn-leave">Quitter le duel du jour</button>`;
  el.innerHTML = html;
  $("#dd-btn-leave")?.addEventListener("click", () => withErrorToast(leaveSession));
  wireAvailableListEvents();
  wireIncomingProposalEvents(incoming[0]);
  wireActiveDuelEvents(activeDuel);
  restoreInputs(preserved);
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

function renderProposeForm(target) {
  const gameOptions = getAllGames().map((g) => `<option value="${g}">${g}</option>`).join("");
  const formatOptions = FORMATS.map((f) => `<option value="${f.id}">${f.label}</option>`).join("");
  return `
    <div class="dd-propose-form">
      <label for="dd-propose-game">Jeu</label>
      <select id="dd-propose-game">${gameOptions}</select>
      <label for="dd-propose-format">Format</label>
      <select id="dd-propose-format">${formatOptions}</select>
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

  if (myResult) {
    return `
      <div class="dd-notif">
        <h3>⚔️ Duel en cours contre ${escapeHtml(oppPseudo)}</h3>
        <p class="settings-note">${escapeHtml(duel.game)} — ${format.label}</p>
        ${litigeNote}
        <p class="settings-note">Ton résultat envoyé : ${myResult.myScore} - ${myResult.oppScore}, ${myResult.iWon ? "victoire" : "défaite"}. En attente de ${escapeHtml(oppPseudo)}…</p>
        <button class="btn btn-ghost" type="button" id="dd-btn-edit-result">Corriger mon résultat</button>
      </div>
    `;
  }

  return `
    <div class="dd-notif">
      <h3>⚔️ Duel en cours contre ${escapeHtml(oppPseudo)}</h3>
      <p class="settings-note">${escapeHtml(duel.game)} — ${format.label}</p>
      ${litigeNote}
      ${renderResultForm()}
    </div>
  `;
}

function renderResultForm() {
  return `
    <form id="dd-result-form">
      <label for="dd-my-score">Ton score</label>
      <input type="number" id="dd-my-score" min="0" required>
      <label for="dd-opp-score">Score de l'adversaire</label>
      <input type="number" id="dd-opp-score" min="0" required>
      <label><input type="checkbox" id="dd-i-won" style="width:auto;display:inline-block;"> J'ai gagné</label>
      <button class="btn btn-primary" type="submit">Valider mon résultat</button>
    </form>
  `;
}

function wireAvailableListEvents() {
  document.querySelectorAll('[data-action="propose"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      proposingToUid = proposingToUid === btn.dataset.uid ? null : btn.dataset.uid;
      render();
    });
  });
  document.querySelectorAll('[data-action="view-profile"]').forEach((btn) => {
    btn.addEventListener("click", () => openPlayerProfileModal(btn.dataset.uid));
  });
  $("#dd-btn-send-proposal")?.addEventListener("click", () => withErrorToast(() => proposeDuel(proposingToUid)));

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
  $("#dd-btn-accept")?.addEventListener("click", () => withErrorToast(() => acceptProposal(duel.id)));
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
});
