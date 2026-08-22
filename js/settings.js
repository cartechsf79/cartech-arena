// ============================================================================
// Car'Tech Arena — Paramètres du compte
// (pseudo, mot de passe, photo, décorations, thème, profil d'un autre joueur,
//  outils organisateur, suppression de compte)
// ============================================================================
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  updatePassword,
  updateProfile,
  deleteUser,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  limit,
  getDocs,
  arrayUnion,
  arrayRemove,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import { auth, db, ORGANIZER_EMAIL } from "./firebase-init.js";
import { $, showToast, friendlyError, getCurrentProfile, getCurrentUid, renderAvatar, renderProfile, showSettingsScreen } from "./app.js";
import { DECORATIONS, THEMES, findTheme, applyTheme } from "./catalog.js";

const MAX_PHOTO_BYTES = 700_000; // marge de sécurité sous la limite de 1 Mo par document Firestore
let pendingPhotoDataUrl = null; // photo choisie mais pas encore enregistrée

// ---------------------------------------------------------------------------
// Rafraîchit l'écran principal + le cache local après une modification
// ---------------------------------------------------------------------------
async function refreshAfterChange() {
  const uid = getCurrentUid();
  if (!uid) return null;
  const snap = await getDoc(doc(db, "users", uid));
  const profile = snap.exists() ? snap.data() : null;
  // renderProfile() est la même fonction utilisée à la connexion : elle met à
  // jour l'état partagé (getCurrentProfile), l'écran principal ET applique le
  // thème — pas de logique dupliquée, donc pas de désynchronisation possible.
  if (profile) renderProfile(profile);
  return profile;
}

// ---------------------------------------------------------------------------
// Remplit l'écran Paramètres avec les valeurs actuelles du profil
// ---------------------------------------------------------------------------
function populateSettingsScreen() {
  const profile = getCurrentProfile();
  if (!profile) return;

  $("#settings-pseudo").value = profile.pseudo || "";
  renderAvatar($("#settings-avatar-preview"), profile, 72);
  pendingPhotoDataUrl = null;
  $("#btn-save-photo").disabled = true;

  const hasPassword = (auth.currentUser?.providerData || []).some((p) => p.providerId === "password");
  $("#section-password").style.display = hasPassword ? "" : "none";
  $("#note-google-only").style.display = hasPassword ? "none" : "";

  renderDecorationsGrid(profile);
  renderThemesGrid(profile);

  $("#search-player-result").innerHTML = "";
  $("#search-player-input").value = "";
}

// ---------------------------------------------------------------------------
// Pseudo
// ---------------------------------------------------------------------------
async function handleSavePseudo(e) {
  e.preventDefault();
  const pseudo = $("#settings-pseudo").value.trim();
  if (!pseudo) {
    showToast("Choisis un pseudo 🙂", true);
    return;
  }
  try {
    await updateProfile(auth.currentUser, { displayName: pseudo });
    await updateDoc(doc(db, "users", getCurrentUid()), {
      pseudo,
      pseudoLower: pseudo.toLowerCase(),
    });
    await refreshAfterChange();
    showToast("Pseudo mis à jour !");
  } catch (err) {
    showToast(friendlyError(err), true);
  }
}

// ---------------------------------------------------------------------------
// Mot de passe
// ---------------------------------------------------------------------------
async function handleChangePassword(e) {
  e.preventDefault();
  const current = $("#settings-current-password").value;
  const next = $("#settings-new-password").value;
  const confirm = $("#settings-confirm-password").value;

  if (next.length < 6) {
    showToast("Le nouveau mot de passe doit faire au moins 6 caractères.", true);
    return;
  }
  if (next !== confirm) {
    showToast("Les deux mots de passe ne correspondent pas.", true);
    return;
  }

  try {
    const cred = EmailAuthProvider.credential(auth.currentUser.email, current);
    await reauthenticateWithCredential(auth.currentUser, cred);
    await updatePassword(auth.currentUser, next);
    $("#form-change-password").reset();
    showToast("Mot de passe changé avec succès !");
  } catch (err) {
    showToast(friendlyError(err), true);
  }
}

// ---------------------------------------------------------------------------
// Photo de profil — recadrage carré + redimensionnement 512×512 côté client
// ---------------------------------------------------------------------------
function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

async function handlePhotoChosen(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  const img = await fileToImage(file);
  const canvas = $("#photo-canvas");
  const ctx = canvas.getContext("2d");
  const SIZE = 512;
  canvas.width = SIZE;
  canvas.height = SIZE;

  // Recadrage centré en carré (couvre tout le cadre, comme un "object-fit: cover")
  const side = Math.min(img.width, img.height);
  const sx = (img.width - side) / 2;
  const sy = (img.height - side) / 2;
  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE);

  // Compression progressive jusqu'à rester sous la taille maximale
  let quality = 0.85;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);
  while (dataUrl.length > MAX_PHOTO_BYTES && quality > 0.3) {
    quality -= 0.15;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }

  pendingPhotoDataUrl = dataUrl;
  const preview = $("#settings-avatar-preview");
  preview.innerHTML = "";
  preview.className = "avatar-shell";
  const inner = document.createElement("div");
  inner.className = "avatar-inner";
  inner.style.backgroundImage = `url("${dataUrl}")`;
  inner.style.backgroundSize = "cover";
  inner.style.backgroundPosition = "center";
  preview.appendChild(inner);

  $("#btn-save-photo").disabled = false;
}

async function handleSavePhoto() {
  if (!pendingPhotoDataUrl) return;
  try {
    await updateDoc(doc(db, "users", getCurrentUid()), { photoDataUrl: pendingPhotoDataUrl });
    pendingPhotoDataUrl = null;
    $("#btn-save-photo").disabled = true;
    const profile = await refreshAfterChange();
    if (profile) renderAvatar($("#settings-avatar-preview"), profile, 72);
    showToast("Photo de profil mise à jour !");
  } catch (err) {
    showToast(friendlyError(err), true);
  }
}

async function handleRemovePhoto() {
  try {
    await updateDoc(doc(db, "users", getCurrentUid()), { photoDataUrl: null });
    pendingPhotoDataUrl = null;
    $("#settings-photo-input").value = "";
    $("#btn-save-photo").disabled = true;
    await refreshAfterChange();
    populateSettingsScreen();
    showToast("Photo retirée.");
  } catch (err) {
    showToast(friendlyError(err), true);
  }
}

// ---------------------------------------------------------------------------
// Décorations (soi-même) — on ne peut que choisir laquelle est active parmi
// celles déjà débloquées ; le déblocage est réservé à l'organisateur.
// ---------------------------------------------------------------------------
function renderDecorationsGrid(profile) {
  const grid = $("#decorations-grid");
  grid.innerHTML = "";
  const owned = profile?.decorations?.owned || [];
  const active = profile?.decorations?.active || null;

  const noneChip = document.createElement("div");
  noneChip.className = "chip" + (active === null ? " active" : "");
  noneChip.innerHTML = `<div class="chip-swatch" style="background:var(--bg2);border:1px dashed var(--panel-border);"></div><div class="chip-label">Aucune</div>`;
  noneChip.onclick = () => setActiveDecoration(null);
  grid.appendChild(noneChip);

  DECORATIONS.forEach((deco) => {
    const isOwned = owned.includes(deco.id);
    const chip = document.createElement("div");
    chip.className = "chip" + (!isOwned ? " locked" : "") + (active === deco.id ? " active" : "");
    chip.innerHTML = `
      <div class="chip-swatch avatar-shell has-deco ${deco.css}" style="width:34px;height:34px;"><div class="avatar-inner" style="font-size:14px;">🙂</div></div>
      <div class="chip-label">${deco.label}</div>
      <div class="chip-sub">${isOwned ? deco.categorie : "🔒 verrouillé"}</div>
    `;
    if (isOwned) chip.onclick = () => setActiveDecoration(deco.id);
    grid.appendChild(chip);
  });
}

async function setActiveDecoration(decoId) {
  try {
    await updateDoc(doc(db, "users", getCurrentUid()), { "decorations.active": decoId });
    const profile = await refreshAfterChange();
    renderDecorationsGrid(profile);
  } catch (err) {
    showToast(friendlyError(err), true);
  }
}

// ---------------------------------------------------------------------------
// Thèmes (soi-même)
// ---------------------------------------------------------------------------
function renderThemesGrid(profile) {
  const grid = $("#themes-grid");
  grid.innerHTML = "";
  const owned = profile?.theme?.owned || [];
  const active = profile?.theme?.active || "classique";

  THEMES.forEach((theme) => {
    const isOwned = owned.includes(theme.id);
    const chip = document.createElement("div");
    chip.className = "chip" + (!isOwned ? " locked" : "") + (active === theme.id ? " active" : "");
    chip.innerHTML = `
      <div class="chip-swatch theme-swatch-${theme.id}"></div>
      <div class="chip-label">${theme.label}</div>
      <div class="chip-sub">${isOwned ? "Débloqué" : "🔒 verrouillé"}</div>
    `;
    if (isOwned) chip.onclick = () => setActiveTheme(theme.id);
    grid.appendChild(chip);
  });
}

async function setActiveTheme(themeId) {
  try {
    await updateDoc(doc(db, "users", getCurrentUid()), { "theme.active": themeId });
    applyTheme(themeId);
    const profile = await refreshAfterChange();
    renderThemesGrid(profile);
  } catch (err) {
    showToast(friendlyError(err), true);
  }
}

// ---------------------------------------------------------------------------
// Recherche d'un joueur / affichage de son profil (+ outils organisateur)
// ---------------------------------------------------------------------------
async function handleSearchPlayer(e) {
  e.preventDefault();
  const term = $("#search-player-input").value.trim().toLowerCase();
  const resultEl = $("#search-player-result");
  resultEl.innerHTML = "";
  if (!term) return;

  try {
    const q = query(collection(db, "users"), where("pseudoLower", "==", term), limit(1));
    const snap = await getDocs(q);
    if (snap.empty) {
      resultEl.innerHTML = `<p class="settings-note">Aucun joueur trouvé avec ce pseudo.</p>`;
      return;
    }
    const targetDoc = snap.docs[0];
    renderPlayerCard(targetDoc.id, targetDoc.data());
  } catch (err) {
    showToast(friendlyError(err), true);
  }
}

// Ouvre directement la fiche d'un joueur précis (utilisé notamment par le
// bouton "Voir profil" du Duel du jour) sans passer par la recherche par
// pseudo — on va chercher son profil complet (points, rôle...) car les
// fiches "participant" du Duel du jour ne contiennent pas ces infos.
export async function showPlayerProfileScreen(targetUid) {
  showSettingsScreen();
  populateSettingsScreen();
  try {
    const snap = await getDoc(doc(db, "users", targetUid));
    if (!snap.exists()) {
      showToast("Profil introuvable.", true);
      return;
    }
    $("#search-player-input").value = snap.data().pseudo || "";
    renderPlayerCard(targetUid, snap.data());
    $("#search-player-result")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    showToast(friendlyError(err), true);
  }
}

function renderPlayerCard(targetUid, targetProfile) {
  const resultEl = $("#search-player-result");
  resultEl.innerHTML = "";
  const isOrganizer = getCurrentProfile()?.role === "organisateur";

  const card = document.createElement("div");
  card.className = "player-card";
  const avatar = document.createElement("div");
  renderAvatar(avatar, targetProfile, 50);
  card.appendChild(avatar);

  const info = document.createElement("div");
  info.className = "player-card-info";
  const isOrg = targetProfile.role === "organisateur";
  info.innerHTML = `
    <div style="font-weight:800;">${targetProfile.pseudo}</div>
    <span class="badge ${isOrg ? "badge-organizer" : "badge-player"}">${isOrg ? "🛡️ Organisateur" : "🎮 Joueur"}</span>
    <div class="settings-note">${targetProfile.points ?? 0} pts · ${targetProfile.wins ?? 0}V / ${targetProfile.losses ?? 0}D</div>
  `;
  card.appendChild(info);
  resultEl.appendChild(card);

  const tags = document.createElement("div");
  tags.className = "player-tags";
  tags.textContent = "Tags : aucun pour le moment (arrivera prochainement).";
  resultEl.appendChild(tags);

  if (isOrganizer) {
    resultEl.appendChild(buildOrganizerManagePanel(targetUid, targetProfile));
  }
}

function buildOrganizerManagePanel(targetUid, targetProfile) {
  const wrap = document.createElement("div");

  const decoLabel = document.createElement("div");
  decoLabel.className = "manage-grid-label";
  decoLabel.textContent = "🛡️ Décorations à attribuer";
  wrap.appendChild(decoLabel);

  const decoGrid = document.createElement("div");
  decoGrid.className = "chip-grid";
  DECORATIONS.forEach((deco) => {
    const owned = (targetProfile.decorations?.owned || []).includes(deco.id);
    const chip = document.createElement("div");
    chip.className = "chip" + (owned ? " active" : "");
    chip.innerHTML = `
      <div class="chip-swatch avatar-shell has-deco ${deco.css}" style="width:34px;height:34px;"><div class="avatar-inner" style="font-size:14px;">🙂</div></div>
      <div class="chip-label">${deco.label}</div>
      <div class="chip-sub">${owned ? "✅ Possédée" : "Donner"}</div>
    `;
    chip.onclick = async () => {
      try {
        await updateDoc(doc(db, "users", targetUid), {
          "decorations.owned": owned ? arrayRemove(deco.id) : arrayUnion(deco.id),
        });
        const snap = await getDoc(doc(db, "users", targetUid));
        renderPlayerCard(targetUid, snap.data());
        showToast(owned ? "Décoration retirée." : "Décoration attribuée !");
      } catch (err) {
        showToast(friendlyError(err), true);
      }
    };
    decoGrid.appendChild(chip);
  });
  wrap.appendChild(decoGrid);

  const themeLabel = document.createElement("div");
  themeLabel.className = "manage-grid-label";
  themeLabel.textContent = "🏆 Thèmes Trophée à attribuer";
  wrap.appendChild(themeLabel);

  const themeGrid = document.createElement("div");
  themeGrid.className = "chip-grid";
  THEMES.filter((t) => t.locked).forEach((theme) => {
    const owned = (targetProfile.theme?.owned || []).includes(theme.id);
    const chip = document.createElement("div");
    chip.className = "chip" + (owned ? " active" : "");
    chip.innerHTML = `
      <div class="chip-swatch theme-swatch-${theme.id}"></div>
      <div class="chip-label">${theme.label}</div>
      <div class="chip-sub">${owned ? "✅ Possédé" : "Donner"}</div>
    `;
    chip.onclick = async () => {
      try {
        await updateDoc(doc(db, "users", targetUid), {
          "theme.owned": owned ? arrayRemove(theme.id) : arrayUnion(theme.id),
        });
        const snap = await getDoc(doc(db, "users", targetUid));
        renderPlayerCard(targetUid, snap.data());
        showToast(owned ? "Thème retiré." : "Thème attribué !");
      } catch (err) {
        showToast(friendlyError(err), true);
      }
    };
    themeGrid.appendChild(chip);
  });
  wrap.appendChild(themeGrid);

  return wrap;
}

// ---------------------------------------------------------------------------
// Suppression de compte
// ---------------------------------------------------------------------------
let deleteCode = null;

function openModal(id) { $("#" + id).classList.add("show"); }
function closeModal(id) { $("#" + id).classList.remove("show"); }

function openDeleteStep1() {
  openModal("overlay-delete-step1");
}

function openDeleteStep2() {
  closeModal("overlay-delete-step1");
  deleteCode = String(Math.floor(1000 + Math.random() * 9000));
  $("#delete-code-display").textContent = deleteCode;
  $("#delete-code-input").value = "";
  $("#btn-delete-confirm").disabled = true;

  const hasPassword = (auth.currentUser?.providerData || []).some((p) => p.providerId === "password");
  $("#delete-reauth-password-wrap").style.display = hasPassword ? "" : "none";
  $("#btn-delete-reauth-google").style.display = hasPassword ? "none" : "";
  $("#btn-delete-reauth-google").disabled = true;
  $("#btn-delete-confirm").style.display = hasPassword ? "" : "none";
  $("#delete-reauth-password").value = "";

  openModal("overlay-delete-step2");
}

function checkDeleteCodeMatch() {
  const ok = $("#delete-code-input").value.trim() === deleteCode;
  $("#btn-delete-confirm").disabled = !ok;
  $("#btn-delete-reauth-google").disabled = !ok;
}

async function performAccountDeletion(reauthFn) {
  try {
    await reauthFn();
    const uid = getCurrentUid();
    await deleteDoc(doc(db, "users", uid));
    await deleteUser(auth.currentUser);
    closeModal("overlay-delete-step2");
    showToast("Ton compte a bien été supprimé.");
  } catch (err) {
    showToast(friendlyError(err), true);
  }
}

async function handleConfirmDeletePassword() {
  const password = $("#delete-reauth-password").value;
  if (!password) {
    showToast("Confirme ton mot de passe pour continuer.", true);
    return;
  }
  await performAccountDeletion(async () => {
    const cred = EmailAuthProvider.credential(auth.currentUser.email, password);
    await reauthenticateWithCredential(auth.currentUser, cred);
  });
}

async function handleConfirmDeleteGoogle() {
  await performAccountDeletion(async () => {
    await reauthenticateWithPopup(auth.currentUser, new GoogleAuthProvider());
  });
}

// ---------------------------------------------------------------------------
// Câblage des événements
// ---------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  $("#btn-open-settings").addEventListener("click", populateSettingsScreen);

  $("#form-change-pseudo").addEventListener("submit", handleSavePseudo);
  $("#form-change-password").addEventListener("submit", handleChangePassword);

  $("#settings-photo-input").addEventListener("change", handlePhotoChosen);
  $("#btn-save-photo").addEventListener("click", handleSavePhoto);
  $("#btn-remove-photo").addEventListener("click", handleRemovePhoto);

  $("#form-search-player").addEventListener("submit", handleSearchPlayer);

  $("#btn-delete-account").addEventListener("click", openDeleteStep1);
  $("#btn-delete-cancel-1").addEventListener("click", () => closeModal("overlay-delete-step1"));
  $("#btn-delete-continue").addEventListener("click", openDeleteStep2);
  $("#btn-delete-cancel-2").addEventListener("click", () => closeModal("overlay-delete-step2"));
  $("#delete-code-input").addEventListener("input", checkDeleteCodeMatch);
  $("#btn-delete-confirm").addEventListener("click", handleConfirmDeletePassword);
  $("#btn-delete-reauth-google").addEventListener("click", handleConfirmDeleteGoogle);
});
