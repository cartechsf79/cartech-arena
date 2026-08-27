// ============================================================================
// Car'Tech Arena — Calendrier (Task #44)
// Volontairement TOTALEMENT INDÉPENDANT du système d'Événement (event.js) :
// pas de collection "events" ici, pas de synchronisation, pas de validation
// par l'organisateur. Une "annonce" de calendrier n'est qu'une date + un jeu
// ; n'importe quel compte connecté peut librement dire "je suis
// intéressé(e)" (ou se retirer) en ajoutant/retirant SON PROPRE uid du
// tableau "interested" — voir onlyToggledOwnInterest() dans firestore.rules
// et son miroir checkCalendarAnnouncementWrite() dans le mock de test.
// Seul l'organisateur peut créer/supprimer une annonce.
// ============================================================================
import {
  doc,
  addDoc,
  deleteDoc,
  updateDoc,
  collection,
  onSnapshot,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import { db } from "./firebase-init.js";
import { $, getCurrentProfile, getCurrentUid, showToast, friendlyError, renderAvatar, hideAllViews, titleBadgeHtml } from "./app.js";
import { getAllGames } from "./live-catalog.js";
import { localDateStr } from "./season.js";

async function withErrorToast(fn) {
  try {
    await fn();
  } catch (err) {
    console.error(err);
    showToast(friendlyError(err), true);
  }
}

function isOrganizer() {
  return getCurrentProfile()?.role === "organisateur";
}
function myUid() {
  return getCurrentUid();
}
function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

const announcementsCol = collection(db, "calendarAnnouncements");
const usersCol = collection(db, "users");

// ---------------------------------------------------------------------------
// État local
// ---------------------------------------------------------------------------
let announcements = [];
let usersByUid = {}; // uid -> profil {pseudo, photoDataUrl, decorations, ...} (voir renderAvatar)
let unsubAnnouncements = null;
let unsubUsers = null;
let listening = false;

let monthOffset = 0; // 0 = mois actuel, +1 = suivant, -1 = précédent
let expandedId = null;
let showInterestedFor = null; // id de l'annonce dont la liste des intéressés est dépliée

function startListening() {
  if (listening) return;
  listening = true;
  unsubAnnouncements = onSnapshot(announcementsCol, (snap) => {
    announcements = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  });
  unsubUsers = onSnapshot(usersCol, (snap) => {
    usersByUid = {};
    snap.docs.forEach((d) => (usersByUid[d.id] = { id: d.id, ...d.data() }));
    render();
  });
}
function stopListening() {
  if (unsubAnnouncements) unsubAnnouncements();
  if (unsubUsers) unsubUsers();
  unsubAnnouncements = unsubUsers = null;
  listening = false;
}

// ---------------------------------------------------------------------------
// Actions — organisateur (créer / supprimer une annonce)
// ---------------------------------------------------------------------------
async function createAnnouncement() {
  const game = $("#cal-create-game")?.value;
  const date = $("#cal-create-date")?.value;
  if (!date) {
    showToast("Choisis une date.", true);
    return;
  }
  await addDoc(announcementsCol, {
    game,
    date,
    interested: [],
    createdAt: serverTimestamp(),
    createdBy: myUid(),
  });
  showToast("Ajouté au calendrier !");
}

async function deleteAnnouncement(id) {
  await deleteDoc(doc(announcementsCol, id));
  if (expandedId === id) expandedId = null;
  showToast("Retiré du calendrier.");
}

// ---------------------------------------------------------------------------
// Actions — tout le monde (aucune validation, voir l'en-tête du fichier)
// ---------------------------------------------------------------------------
async function toggleMyInterest(ann) {
  const uid = myUid();
  const alreadyIn = (ann.interested || []).includes(uid);
  await updateDoc(doc(announcementsCol, ann.id), {
    interested: alreadyIn ? arrayRemove(uid) : arrayUnion(uid),
  });
}

// ---------------------------------------------------------------------------
// Rendu — panneau organisateur (création + suppression)
// ---------------------------------------------------------------------------
function renderOrganizerPanel() {
  const el = $("#cal-organizer-panel");
  if (!el) return;
  if (!isOrganizer()) {
    el.style.display = "none";
    return;
  }
  el.style.display = "";

  const gameOptions = getAllGames().map((g) => `<option value="${g}">${g}</option>`).join("");
  let html = `
    <h3>📅 Organisateur — Calendrier</h3>
    <div class="manage-grid-label">Ajouter une date au calendrier</div>
    <label for="cal-create-game">Jeu</label>
    <select id="cal-create-game">${gameOptions}</select>
    <label for="cal-create-date">Date</label>
    <input type="date" id="cal-create-date" required>
    <button class="btn btn-primary" type="button" id="cal-btn-create">Ajouter</button>
  `;

  const upcoming = announcements.slice().sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  if (upcoming.length) {
    html += `<div class="manage-grid-label">Annonces du calendrier</div>`;
    upcoming.forEach((a) => {
      html += `
        <div class="dd-row">
          <div class="dd-row-name">📅 ${escapeHtml(a.date)} — ${escapeHtml(a.game)} <span class="dd-pill">${(a.interested || []).length} intéressé${(a.interested || []).length > 1 ? "s" : ""}</span></div>
          <div class="dd-row-actions"><button class="btn-mini btn-mini-no" data-action="cal-delete" data-id="${a.id}">Supprimer</button></div>
        </div>`;
    });
  }

  el.innerHTML = html;
  $("#cal-btn-create")?.addEventListener("click", () => withErrorToast(createAnnouncement));
  el.querySelectorAll('[data-action="cal-delete"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!confirm("Retirer cette date du calendrier ?")) return;
      withErrorToast(() => deleteAnnouncement(btn.dataset.id));
    });
  });
}

// ---------------------------------------------------------------------------
// Rendu — grille mensuelle
// ---------------------------------------------------------------------------
const CAL_WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const CAL_MONTH_LABELS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

function displayedMonth() {
  const base = new Date();
  base.setDate(1);
  base.setMonth(base.getMonth() + monthOffset);
  return { year: base.getFullYear(), month: base.getMonth() }; // month: 0-11
}
function dateStrOf(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
function buildCells(year, month) {
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
function announcementsOnDate(dateStr) {
  return announcements.filter((a) => a.date === dateStr);
}

function renderGrid() {
  const el = $("#calendar-grid");
  if (!el) return;

  const { year, month } = displayedMonth();
  const cells = buildCells(year, month);
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
    const dStr = dateStrOf(year, month, day);
    const dayAnnouncements = announcementsOnDate(dStr);
    html += `<div class="cal-cell${dStr === todayStr ? " cal-cell-today" : ""}">
      <div class="cal-cell-daynum">${day}</div>
      ${dayAnnouncements
        .map(
          (a) =>
            `<button type="button" class="cal-chip${a.id === expandedId ? " cal-chip-selected" : ""}" data-action="cal-pick" data-id="${a.id}">${escapeHtml(a.game)}</button>`
        )
        .join("")}
    </div>`;
  });

  html += `</div>`;
  if (!announcements.length) {
    html += `<p class="settings-note">Aucune date annoncée pour l'instant — reviens plus tard !</p>`;
  }
  el.innerHTML = html;

  $("#cal-btn-prev")?.addEventListener("click", () => {
    monthOffset -= 1;
    render();
  });
  $("#cal-btn-next")?.addEventListener("click", () => {
    monthOffset += 1;
    render();
  });
  el.querySelectorAll('[data-action="cal-pick"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      expandedId = btn.dataset.id;
      render();
      $("#calendar-detail")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function renderDetail() {
  const el = $("#calendar-detail");
  if (!el) return;

  const ann = expandedId ? announcements.find((a) => a.id === expandedId) : null;
  if (!ann) {
    el.innerHTML = "";
    el.style.display = "none";
    return;
  }
  el.style.display = "";

  const interestedUids = ann.interested || [];
  const iAmIn = interestedUids.includes(myUid());
  // Le jour J (date de l'annonce == aujourd'hui), on n'affiche plus le
  // bouton "intéressé(e)" -- il n'y a plus de sens à s'inscrire une fois
  // qu'on est sur la case de l'événement -- mais la liste des joueurs
  // intéressés reste consultable normalement.
  const isEventDay = ann.date === localDateStr();

  let html = `
    <h3>📅 ${escapeHtml(ann.date)} — ${escapeHtml(ann.game)}</h3>
    <p class="settings-note">Une simple annonce — aucune inscription ni validation nécessaire, dis juste si ça t'intéresse !</p>
    ${
      isEventDay
        ? ""
        : `<button class="btn ${iAmIn ? "btn-ghost" : "btn-primary"}" type="button" id="cal-btn-toggle-interest">
      ${iAmIn ? "🙅 Je ne suis plus intéressé(e)" : "🙋 Je suis intéressé(e)"}
    </button>`
    }
    <button class="btn-mini btn-mini-ghost" type="button" id="cal-btn-toggle-list">${interestedUids.length} intéressé${interestedUids.length > 1 ? "s" : ""}</button>
  `;

  if (showInterestedFor === ann.id) {
    html += `<div class="manage-grid-label">Joueurs intéressés</div>`;
    if (!interestedUids.length) {
      html += `<p class="settings-note">Personne pour l'instant.</p>`;
    } else {
      interestedUids.forEach((uid) => {
        const profile = usersByUid[uid];
        const pseudo = profile ? profile.pseudo : "…";
        // Titre actif du joueur (voir titleBadgeHtml dans app.js) : affiché
        // juste à côté du pseudo, comme partout ailleurs où un pseudo
        // apparaît dans l'appli.
        html += `<div class="dd-row"><div class="dd-row-avatar" data-avatar="${uid}"></div><div class="dd-row-name">${escapeHtml(pseudo)}${profile ? titleBadgeHtml(profile) : ""}</div></div>`;
      });
    }
  }

  el.innerHTML = html;

  if (showInterestedFor === ann.id) {
    interestedUids.forEach((uid) => {
      const profile = usersByUid[uid];
      const holder = el.querySelector(`[data-avatar="${uid}"]`);
      if (holder && profile) renderAvatar(holder, profile, 34);
    });
  }

  $("#cal-btn-toggle-interest")?.addEventListener("click", () => withErrorToast(() => toggleMyInterest(ann)));
  $("#cal-btn-toggle-list")?.addEventListener("click", () => {
    showInterestedFor = showInterestedFor === ann.id ? null : ann.id;
    render();
  });
}

function render() {
  renderOrganizerPanel();
  renderGrid();
  renderDetail();
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------
export function showCalendarScreen() {
  hideAllViews();
  $("#view-calendar")?.classList.add("active");
  startListening();
  monthOffset = 0;
  render();
}
function closeCalendarScreen() {
  hideAllViews();
  $("#view-app")?.classList.add("active");
  stopListening();
  expandedId = null;
  showInterestedFor = null;
}

document.addEventListener("DOMContentLoaded", () => {
  $("#btn-open-calendar")?.addEventListener("click", showCalendarScreen);
  $("#btn-close-calendar")?.addEventListener("click", closeCalendarScreen);
});
