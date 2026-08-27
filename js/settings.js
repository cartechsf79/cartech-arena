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
import { $, showToast, friendlyError, getCurrentProfile, getCurrentUid, renderAvatar, renderProfile, showSettingsScreen, applyProfileBackground, winsLossesHtml, titleBadgeHtml } from "./app.js";
import {
  getAllDecorations,
  getAllThemes,
  getAllTags,
  getAllProfileBgs,
  findAnyProfileBg,
  usableTagsFor,
  isTagUsable,
  findAnyTag,
  applyThemeLive,
  contrastTextColor,
  compressStaticDecoImage,
  compressThemeBgImage,
  compressTagEmojiImage,
  compressProfileBgImage,
  fileToRawDataUrl,
  MAX_ANIMATED_DECO_BYTES,
  MAX_THEME_BG_BYTES,
  MAX_TAG_EMOJI_BYTES,
  MAX_ANIMATED_TAG_EMOJI_BYTES,
  MAX_PROFILE_BG_BYTES,
  createDecoration,
  updateDecoration,
  deleteDecoration,
  createTheme,
  updateTheme,
  deleteTheme,
  createTag,
  updateTag,
  deleteTag,
  getTagIcon,
  createProfileBg,
  updateProfileBg,
  deleteProfileBg,
  getAllTitles,
  findAnyTitle,
  createTitle,
  updateTitle,
  deleteTitle,
  getAllGames,
  createGame,
  getGameWinCondition,
  setGameWinCondition,
  winConditionLabel,
  getGameElements,
  addGameElement,
  removeGameElement,
  compressGameElementImage,
  downloadDecorationTemplate,
  downloadThemeBgTemplate,
  downloadTagEmojiTemplate,
  downloadProfileBgTemplate,
  downloadGameElementTemplate,
} from "./live-catalog.js";
import { fetchCareerStats, fetchHeadToHead, fetchAdjustmentsForUid, addPointAdjustment, deletePointAdjustment } from "./season.js";

const MAX_PHOTO_BYTES = 700_000; // marge de sécurité sous la limite de 1 Mo par document Firestore
const CROP_VIEWPORT = 260; // doit correspondre à la taille CSS de .cropper-viewport
let cropperImgObj = null; // image (déjà chargée) en cours de recadrage, ou null

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
  cropperImgObj = null;
  $("#cropper-wrap").style.display = "none";
  $("#btn-save-photo").disabled = true;

  const hasPassword = (auth.currentUser?.providerData || []).some((p) => p.providerId === "password");
  $("#section-password").style.display = hasPassword ? "" : "none";
  $("#note-google-only").style.display = hasPassword ? "none" : "";

  renderDecorationsGrid(profile);
  renderProfileBgGrid(profile);
  renderTitlesGrid(profile);
  renderThemesGrid(profile);
  renderTagsGrid(profile);
  renderReferralInfo(profile);

  $("#search-player-result").innerHTML = "";
  $("#search-player-input").value = "";
}

// ---------------------------------------------------------------------------
// Parrainage — mon propre statut (ai-je un parrain, la récompense a-t-elle
// été accordée) + le nombre de joueurs que J'AI moi-même parrainés (compte
// tous les comptes dont referral.referredByUid == mon uid) — voir js/app.js
// pour la modale d'inscription et js/daily-duel.js pour l'octroi de la
// récompense. Purement informatif pour l'instant ("pour plus tard").
// ---------------------------------------------------------------------------
async function renderReferralInfo(profile) {
  const statusEl = $("#referral-status");
  const countEl = $("#referral-count");
  if (!statusEl || !countEl) return;

  const referredByUid = profile?.referral?.referredByUid || null;
  statusEl.textContent = referredByUid
    ? profile?.referral?.rewardGranted
      ? "🎁 Tu as été parrainé — récompense reçue !"
      : "🎁 Tu as été parrainé — la récompense arrive après ton premier duel du jour."
    : "Tu n'as indiqué aucun parrain (une seule occasion, à l'inscription).";

  countEl.textContent = "Chargement…";
  try {
    const uid = getCurrentUid();
    const q = query(collection(db, "users"), where("referral.referredByUid", "==", uid));
    const snap = await getDocs(q);
    const n = snap.docs.length;
    countEl.textContent = `Tu as parrainé ${n} joueur${n > 1 ? "s" : ""}.`;
  } catch (err) {
    countEl.textContent = "Impossible de charger le nombre de filleuls pour l'instant.";
  }
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
// Photo de profil — recadrage interactif (zoom + position) puis
// redimensionnement 512×512 côté client, comme avant. On peut recadrer une
// image tout juste choisie, ou reprendre la photo déjà enregistrée pour la
// repositionner sans avoir à la réimporter.
// ---------------------------------------------------------------------------
function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
function dataUrlToImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function openCropper() {
  $("#cropper-wrap").style.display = "";
  $("#cropper-image").src = cropperImgObj.src;
  $("#photo-zoom").value = 100;
  $("#photo-pan-x").value = 50;
  $("#photo-pan-y").value = 50;
  updateCropperTransform();
  $("#cropper-wrap")?.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function handlePhotoChosen(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    cropperImgObj = await fileToImage(file);
    openCropper();
  } catch (err) {
    showToast("Impossible de lire cette image.", true);
  }
}

async function handleRecropExisting() {
  const profile = getCurrentProfile();
  if (!profile?.photoDataUrl) {
    showToast("Choisis d'abord une image à importer 🙂", true);
    return;
  }
  try {
    cropperImgObj = await dataUrlToImage(profile.photoDataUrl);
    openCropper();
  } catch (err) {
    showToast("Impossible de recharger la photo actuelle.", true);
  }
}

// zoom (100-300 = x1 à x3) et position (0-100, 50 = centré) sur des curseurs
// plutôt que du glisser-déposer : plus fiable au doigt sur un téléphone, et
// ça évite d'avoir à gérer soi-même les événements tactiles.
function cropperGeometry() {
  const zoom = Number($("#photo-zoom").value) / 100;
  const baseScale = CROP_VIEWPORT / Math.min(cropperImgObj.naturalWidth, cropperImgObj.naturalHeight);
  const scale = baseScale * zoom;
  const dispW = cropperImgObj.naturalWidth * scale;
  const dispH = cropperImgObj.naturalHeight * scale;
  const maxX = Math.max(0, (dispW - CROP_VIEWPORT) / 2);
  const maxY = Math.max(0, (dispH - CROP_VIEWPORT) / 2);
  const panX = Number($("#photo-pan-x").value);
  const panY = Number($("#photo-pan-y").value);
  const tx = (panX / 100 - 0.5) * 2 * maxX;
  const ty = (panY / 100 - 0.5) * 2 * maxY;
  return { scale, dispW, dispH, tx, ty };
}

function updateCropperTransform() {
  if (!cropperImgObj) return;
  const { dispW, dispH, tx, ty } = cropperGeometry();
  const imgEl = $("#cropper-image");
  imgEl.style.width = dispW + "px";
  imgEl.style.height = dispH + "px";
  imgEl.style.transform = `translate(-50%, -50%) translate(${tx}px, ${ty}px)`;
  $("#btn-save-photo").disabled = false;
}

function bakeCropToDataUrl() {
  const { scale, tx, ty } = cropperGeometry();
  const halfSrc = (CROP_VIEWPORT / 2) / scale;
  const natCx = cropperImgObj.naturalWidth / 2 - tx / scale;
  const natCy = cropperImgObj.naturalHeight / 2 - ty / scale;
  let sx = natCx - halfSrc;
  let sy = natCy - halfSrc;
  const sSize = halfSrc * 2;
  sx = Math.max(0, Math.min(sx, cropperImgObj.naturalWidth - sSize));
  sy = Math.max(0, Math.min(sy, cropperImgObj.naturalHeight - sSize));

  const canvas = $("#photo-canvas");
  const ctx = canvas.getContext("2d");
  const SIZE = 512;
  canvas.width = SIZE;
  canvas.height = SIZE;
  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.drawImage(cropperImgObj, sx, sy, sSize, sSize, 0, 0, SIZE, SIZE);

  let quality = 0.85;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);
  while (dataUrl.length > MAX_PHOTO_BYTES && quality > 0.3) {
    quality -= 0.15;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }
  return dataUrl;
}

async function handleSavePhoto() {
  if (!cropperImgObj) return;
  try {
    const dataUrl = bakeCropToDataUrl();
    await updateDoc(doc(db, "users", getCurrentUid()), { photoDataUrl: dataUrl });
    cropperImgObj = null;
    $("#cropper-wrap").style.display = "none";
    $("#btn-save-photo").disabled = true;
    $("#settings-photo-input").value = "";
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
    cropperImgObj = null;
    $("#cropper-wrap").style.display = "none";
    $("#settings-photo-input").value = "";
    $("#btn-save-photo").disabled = true;
    await refreshAfterChange();
    populateSettingsScreen();
    showToast("Photo retirée.");
  } catch (err) {
    showToast(friendlyError(err), true);
  }
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

// Nom d'un tag précédé de son icône (image personnalisée en priorité, sinon
// emoji texte, sinon rien) — utilisé partout où un tag est affiché (grilles,
// pastilles sur un profil...).
function tagLabelHtml(tag) {
  const icon = getTagIcon(tag);
  if (icon.type === "image") {
    return `<img class="tag-emoji-img" src="${icon.value}" alt=""> ${escapeHtml(tag.name)}`;
  }
  if (icon.type === "emoji") {
    return escapeHtml(icon.value) + " " + escapeHtml(tag.name);
  }
  return escapeHtml(tag.name);
}

// ---------------------------------------------------------------------------
// Décorations (soi-même) — on ne peut que choisir laquelle est active parmi
// celles déjà débloquées ; le déblocage est réservé à l'organisateur. La
// liste fusionne les décorations "de base" et celles créées par
// l'organisateur (statiques ou animées).
// ---------------------------------------------------------------------------
function decoSwatchHtml(deco) {
  if (deco.builtin) {
    return `<div class="chip-swatch avatar-shell has-deco ${deco.css}" style="width:34px;height:34px;"><div class="avatar-inner" style="font-size:14px;">🙂</div></div>`;
  }
  return `<div class="chip-swatch avatar-shell has-deco has-deco-custom" style="width:34px;height:34px;"><div class="avatar-inner" style="font-size:14px;">🙂</div><img class="avatar-deco-overlay" src="${deco.imageDataUrl}" alt=""></div>`;
}

function renderDecorationsGrid(profile) {
  const grid = $("#decorations-grid");
  grid.innerHTML = "";
  const owned = profile?.decorations?.owned || [];
  const active = profile?.decorations?.active || null;
  // L'organisateur a tout de débloqué d'office sur son propre compte, pour
  // pouvoir tester n'importe quelle décoration sans avoir à se l'attribuer
  // lui-même depuis la recherche organisateur.
  const isOrg = profile?.role === "organisateur";

  const noneChip = document.createElement("div");
  noneChip.className = "chip" + (active === null ? " active" : "");
  noneChip.innerHTML = `<div class="chip-swatch" style="background:var(--bg2);border:1px dashed var(--panel-border);"></div><div class="chip-label">Aucune</div>`;
  noneChip.onclick = () => setActiveDecoration(null);
  grid.appendChild(noneChip);

  // Catalogue publié + (au cas où) toute décoration déjà possédée même si
  // l'organisateur l'a dépubliée depuis — pour ne jamais faire "disparaître"
  // une décoration qu'un joueur possède déjà de son propre choix.
  const visible = getAllDecorations({ includeUnpublished: true }).filter(
    (d) => d.builtin || d.published || owned.includes(d.id)
  );
  visible.forEach((deco) => {
    const isOwned = isOrg || owned.includes(deco.id);
    const chip = document.createElement("div");
    chip.className = "chip" + (!isOwned ? " locked" : "") + (active === deco.id ? " active" : "");
    const sub = isOwned ? (deco.builtin ? deco.categorie : (deco.type === "animated" ? "🎞️ Animée" : "Statique")) : "🔒 verrouillé";
    chip.innerHTML = `
      ${decoSwatchHtml(deco)}
      <div class="chip-label">${escapeHtml(deco.label || deco.name)}</div>
      <div class="chip-sub">${sub}</div>
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
    if (profile) renderAvatar($("#settings-avatar-preview"), profile, 72);
  } catch (err) {
    showToast(friendlyError(err), true);
  }
}

// ---------------------------------------------------------------------------
// Fond de profil (soi-même) — même logique de déblocage que les décorations
// (owned/active par compte, débloqué uniquement par l'organisateur).
// ---------------------------------------------------------------------------
function bgSwatchHtml(bg) {
  return `<div class="chip-swatch" style="background-image:url('${bg.imageDataUrl}');background-size:cover;background-position:center;"></div>`;
}

function renderProfileBgGrid(profile) {
  const grid = $("#profile-bg-grid");
  if (!grid) return;
  grid.innerHTML = "";
  const owned = profile?.profileBg?.owned || [];
  const active = profile?.profileBg?.active || null;
  const isOrg = profile?.role === "organisateur";

  const noneChip = document.createElement("div");
  noneChip.className = "chip" + (active === null ? " active" : "");
  noneChip.innerHTML = `<div class="chip-swatch" style="background:var(--bg2);border:1px dashed var(--panel-border);"></div><div class="chip-label">Aucun</div>`;
  noneChip.onclick = () => setActiveProfileBg(null);
  grid.appendChild(noneChip);

  // Même règle que les décorations : catalogue publié + tout fond déjà
  // possédé même si dépublié depuis (pour ne jamais faire "disparaître" un
  // fond qu'un joueur a déjà choisi). L'organisateur voit tout comme débloqué.
  const visible = getAllProfileBgs({ includeUnpublished: true }).filter((b) => b.published || owned.includes(b.id));
  visible.forEach((bg) => {
    const isOwned = isOrg || owned.includes(bg.id);
    const chip = document.createElement("div");
    chip.className = "chip" + (!isOwned ? " locked" : "") + (active === bg.id ? " active" : "");
    chip.innerHTML = `
      ${bgSwatchHtml(bg)}
      <div class="chip-label">${escapeHtml(bg.name)}</div>
      <div class="chip-sub">${isOwned ? "Débloqué" : "🔒 verrouillé"}</div>
    `;
    if (isOwned) chip.onclick = () => setActiveProfileBg(bg.id);
    grid.appendChild(chip);
  });
}

async function setActiveProfileBg(bgId) {
  try {
    await updateDoc(doc(db, "users", getCurrentUid()), { "profileBg.active": bgId });
    const profile = await refreshAfterChange();
    renderProfileBgGrid(profile);
  } catch (err) {
    showToast(friendlyError(err), true);
  }
}

// ---------------------------------------------------------------------------
// Titre personnalisé (soi-même) — même logique de déblocage que le fond de
// profil ci-dessus (owned/active par compte, débloqué uniquement par
// l'organisateur) ; juste un nom, pas d'image.
// ---------------------------------------------------------------------------
function renderTitlesGrid(profile) {
  const grid = $("#titles-grid");
  if (!grid) return;
  grid.innerHTML = "";
  const owned = profile?.title?.owned || [];
  const active = profile?.title?.active || null;
  const isOrg = profile?.role === "organisateur";

  const noneChip = document.createElement("div");
  noneChip.className = "chip" + (active === null ? " active" : "");
  noneChip.innerHTML = `<div class="chip-swatch" style="background:var(--bg2);border:1px dashed var(--panel-border);"></div><div class="chip-label">Aucun</div>`;
  noneChip.onclick = () => setActiveTitle(null);
  grid.appendChild(noneChip);

  const visible = getAllTitles({ includeUnpublished: true, includeAchievements: true }).filter(
    (t) => t.published || owned.includes(t.id)
  );
  visible.forEach((title) => {
    const isOwned = isOrg || owned.includes(title.id);
    const chip = document.createElement("div");
    chip.className = "chip" + (!isOwned ? " locked" : "") + (active === title.id ? " active" : "");
    chip.innerHTML = `
      <div class="chip-swatch" style="display:flex;align-items:center;justify-content:center;font-size:16px;">🎖️</div>
      <div class="chip-label">${escapeHtml(title.name)}</div>
      <div class="chip-sub">${isOwned ? "Débloqué" : "🔒 verrouillé"}</div>
    `;
    if (isOwned) chip.onclick = () => setActiveTitle(title.id);
    grid.appendChild(chip);
  });
}

async function setActiveTitle(titleId) {
  try {
    await updateDoc(doc(db, "users", getCurrentUid()), { "title.active": titleId });
    const profile = await refreshAfterChange();
    renderTitlesGrid(profile);
  } catch (err) {
    showToast(friendlyError(err), true);
  }
}

// ---------------------------------------------------------------------------
// Thèmes (soi-même) — fusionne les 6 thèmes de base et les thèmes
// personnalisés créés par l'organisateur (toujours verrouillés par défaut,
// comme les thèmes "Trophée").
// ---------------------------------------------------------------------------
function themeSwatchHtml(theme) {
  if (theme.builtin) return `<div class="chip-swatch theme-swatch-${theme.id}"></div>`;
  const c = theme.colors || {};
  return `<div class="chip-swatch" style="background:linear-gradient(135deg, ${c.accent || "#8b5cf6"}, ${c.accent2 || "#5b8def"});"></div>`;
}

function renderThemesGrid(profile) {
  const grid = $("#themes-grid");
  grid.innerHTML = "";
  const owned = profile?.theme?.owned || [];
  const active = profile?.theme?.active || "classique";
  const isOrg = profile?.role === "organisateur";

  getAllThemes().forEach((theme) => {
    const isOwned = isOrg || owned.includes(theme.id);
    const chip = document.createElement("div");
    chip.className = "chip" + (!isOwned ? " locked" : "") + (active === theme.id ? " active" : "");
    chip.innerHTML = `
      ${themeSwatchHtml(theme)}
      <div class="chip-label">${escapeHtml(theme.label || theme.name)}</div>
      <div class="chip-sub">${isOwned ? "Débloqué" : "🔒 verrouillé"}</div>
    `;
    if (isOwned) chip.onclick = () => setActiveTheme(theme.id);
    grid.appendChild(chip);
  });
}

async function setActiveTheme(themeId) {
  try {
    await updateDoc(doc(db, "users", getCurrentUid()), { "theme.active": themeId });
    applyThemeLive(themeId);
    const profile = await refreshAfterChange();
    renderThemesGrid(profile);
  } catch (err) {
    showToast(friendlyError(err), true);
  }
}

// ---------------------------------------------------------------------------
// Tags (soi-même) — jusqu'à 5 affichés en même temps parmi ceux débloqués
// (donnés par l'organisateur, ou "par défaut" pour tout le monde).
// ---------------------------------------------------------------------------
// Regroupé en 2 sections pour la lisibilité : les tags "normaux" (créés à la
// main par l'organisateur) d'un côté, les tags de succès (obtenus tout seul
// en jouant, voir achievements.js) de l'autre — sinon les deux se
// retrouvaient mélangés dans une seule grille, difficile à distinguer une
// fois qu'un joueur a pas mal de succès débloqués.
function tagChipEl(tag, isActive) {
  const chip = document.createElement("div");
  chip.className = "chip" + (isActive ? " active" : "");
  chip.innerHTML = `
    <div class="chip-swatch" style="background:${tag.color};"></div>
    <div class="chip-label">${tagLabelHtml(tag)}</div>
    <div class="chip-sub">${isActive ? "✅ Affiché" : "Toucher pour afficher"}</div>
  `;
  chip.onclick = () => toggleActiveTag(tag.id);
  return chip;
}

function renderTagsGrid(profile) {
  const grid = $("#tags-grid");
  const counter = $("#tags-active-count");
  if (!grid) return;
  grid.innerHTML = "";
  const usable = usableTagsFor(profile);
  const active = profile?.tags?.active || [];
  if (counter) counter.textContent = `${active.length}/5 tags affichés sur ton profil.`;

  if (!usable.length) {
    grid.innerHTML = `<p class="settings-note">Aucun tag débloqué pour l'instant.</p>`;
    return;
  }

  const normalTags = usable.filter((t) => !t.isAchievement);
  const achievementTags = usable.filter((t) => t.isAchievement);

  if (normalTags.length) {
    const label = document.createElement("div");
    label.className = "manage-grid-label";
    label.textContent = "🏷️ Tags à gagner";
    grid.appendChild(label);
    const normalGrid = document.createElement("div");
    normalGrid.className = "chip-grid";
    normalTags.forEach((tag) => normalGrid.appendChild(tagChipEl(tag, active.includes(tag.id))));
    grid.appendChild(normalGrid);
  }

  if (achievementTags.length) {
    const label = document.createElement("div");
    label.className = "manage-grid-label";
    label.textContent = "🏆 Tags de succès";
    grid.appendChild(label);
    const achGrid = document.createElement("div");
    achGrid.className = "chip-grid";
    achievementTags.forEach((tag) => achGrid.appendChild(tagChipEl(tag, active.includes(tag.id))));
    grid.appendChild(achGrid);
  }
}

async function toggleActiveTag(tagId) {
  const profile = getCurrentProfile();
  const active = profile?.tags?.active || [];
  let next;
  if (active.includes(tagId)) {
    next = active.filter((id) => id !== tagId);
  } else {
    if (active.length >= 5) {
      showToast("Maximum 5 tags en même temps — désélectionne-en un d'abord.", true);
      return;
    }
    next = [...active, tagId];
  }
  try {
    await updateDoc(doc(db, "users", getCurrentUid()), { "tags.active": next });
    const updated = await refreshAfterChange();
    renderTagsGrid(updated);
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
    await renderPlayerCard(targetDoc.id, targetDoc.data());
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
    await renderPlayerCard(targetUid, snap.data());
    $("#search-player-result")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    showToast(friendlyError(err), true);
  }
}

async function renderPlayerCard(targetUid, targetProfile) {
  const resultEl = $("#search-player-result");
  resultEl.innerHTML = `<p class="settings-note">Chargement…</p>`;
  const isOrganizer = getCurrentProfile()?.role === "organisateur";
  const myUid = getCurrentUid();
  const [career, headToHead] = await Promise.all([
    fetchCareerStats(targetUid),
    myUid && myUid !== targetUid ? fetchHeadToHead(myUid, targetUid) : Promise.resolve(null),
  ]);
  resultEl.innerHTML = "";

  const card = document.createElement("div");
  card.className = "player-card";
  const avatar = document.createElement("div");
  renderAvatar(avatar, targetProfile, 50);
  card.appendChild(avatar);

  const info = document.createElement("div");
  info.className = "player-card-info";
  const isOrg = targetProfile.role === "organisateur";
  const seasonLine =
    career.currentSeasonNumber != null
      ? `${career.currentSeasonPoints} pts — ${winsLossesHtml(career.currentSeasonWins, career.currentSeasonLosses)} — Saison ${career.currentSeasonNumber} en cours`
      : "Aucune saison en cours";
  const headToHeadHtml = headToHead
    ? `<div class="settings-note">Face à face (toi vs ${targetProfile.pseudo}) : ${
        headToHead.matches > 0
          ? `${winsLossesHtml(headToHead.aWins, headToHead.bWins)} sur ${headToHead.matches} match${headToHead.matches > 1 ? "s" : ""}`
          : "aucun match encore joué"
      }</div>`
    : "";
  info.innerHTML = `
    <div style="font-weight:800;">${targetProfile.pseudo}</div>
    ${titleBadgeHtml(targetProfile)}
    <span class="badge ${isOrg ? "badge-organizer" : "badge-player"}">${isOrg ? "🛡️ Organisateur" : "🎮 Joueur"}</span>
    <div class="settings-note">${career.lifetimePoints} pts (total) · ${winsLossesHtml(career.lifetimeWins, career.lifetimeLosses)} (tous matchs)</div>
    <div class="settings-note">${seasonLine}</div>
    ${headToHeadHtml}
  `;
  card.appendChild(info);

  const tags = document.createElement("div");
  tags.className = "player-tags";
  const activeTags = (targetProfile.tags?.active || []).map((id) => findAnyTag(id)).filter(Boolean);
  if (activeTags.length) {
    tags.innerHTML = activeTags
      .map(
        (t) =>
          `<span class="tag-pill" style="background:${t.color};color:${contrastTextColor(t.color)};">${tagLabelHtml(t)}</span>`
      )
      .join(" ");
  } else {
    tags.textContent = "Aucun tag affiché.";
  }

  // Le fond de profil couvre toute la fiche de recherche (carte + tags), pas
  // seulement la petite carte, comme dans la popup "Voir le profil".
  const profileZone = document.createElement("div");
  profileZone.className = "search-profile-zone";
  profileZone.appendChild(card);
  profileZone.appendChild(tags);
  resultEl.appendChild(profileZone);
  applyProfileBackground(profileZone, targetProfile);

  if (isOrganizer) {
    resultEl.appendChild(await buildOrganizerManagePanel(targetUid, targetProfile));
  }
}

async function buildOrganizerManagePanel(targetUid, targetProfile) {
  const wrap = document.createElement("div");

  const decoLabel = document.createElement("div");
  decoLabel.className = "manage-grid-label";
  decoLabel.textContent = "🛡️ Décorations à attribuer";
  wrap.appendChild(decoLabel);

  const decoGrid = document.createElement("div");
  decoGrid.className = "chip-grid";
  // L'organisateur voit toutes ses décorations ici (même non publiées) : il
  // peut vouloir attribuer une décoration en avant-première avant de la
  // publier pour tout le monde.
  getAllDecorations({ includeUnpublished: true }).forEach((deco) => {
    const owned = (targetProfile.decorations?.owned || []).includes(deco.id);
    const chip = document.createElement("div");
    chip.className = "chip" + (owned ? " active" : "");
    chip.innerHTML = `
      ${decoSwatchHtml(deco)}
      <div class="chip-label">${escapeHtml(deco.label || deco.name)}</div>
      <div class="chip-sub">${owned ? "✅ Possédée" : "Donner"}</div>
    `;
    chip.onclick = async () => {
      try {
        const patch = {
          "decorations.owned": owned ? arrayRemove(deco.id) : arrayUnion(deco.id),
        };
        // Si on retire une décoration actuellement affichée par le joueur,
        // on désactive aussi tout de suite plutôt que de laisser "active"
        // pointer vers une décoration qu'il ne possède plus — sinon son
        // document devient invalide et il ne peut plus rien modifier chez
        // lui tant qu'il n'a pas choisi une autre décoration.
        if (owned && targetProfile.decorations?.active === deco.id) {
          patch["decorations.active"] = null;
        }
        await updateDoc(doc(db, "users", targetUid), patch);
        const snap = await getDoc(doc(db, "users", targetUid));
        await renderPlayerCard(targetUid, snap.data());
        showToast(owned ? "Décoration retirée." : "Décoration attribuée !");
      } catch (err) {
        showToast(friendlyError(err), true);
      }
    };
    decoGrid.appendChild(chip);
  });
  wrap.appendChild(decoGrid);

  const bgLabel = document.createElement("div");
  bgLabel.className = "manage-grid-label";
  bgLabel.textContent = "🖼️ Fonds de profil à attribuer";
  wrap.appendChild(bgLabel);

  const bgGrid = document.createElement("div");
  bgGrid.className = "chip-grid";
  getAllProfileBgs({ includeUnpublished: true }).forEach((bg) => {
    const owned = (targetProfile.profileBg?.owned || []).includes(bg.id);
    const chip = document.createElement("div");
    chip.className = "chip" + (owned ? " active" : "");
    chip.innerHTML = `
      ${bgSwatchHtml(bg)}
      <div class="chip-label">${escapeHtml(bg.name)}</div>
      <div class="chip-sub">${owned ? "✅ Possédé" : "Donner"}</div>
    `;
    chip.onclick = async () => {
      try {
        const patch = {
          "profileBg.owned": owned ? arrayRemove(bg.id) : arrayUnion(bg.id),
        };
        // Même logique que les décorations : si on retire le fond
        // actuellement affiché par le joueur, on désactive aussi tout de
        // suite plutôt que de laisser "active" pointer vers un fond qu'il ne
        // possède plus.
        if (owned && targetProfile.profileBg?.active === bg.id) {
          patch["profileBg.active"] = null;
        }
        await updateDoc(doc(db, "users", targetUid), patch);
        const snap = await getDoc(doc(db, "users", targetUid));
        await renderPlayerCard(targetUid, snap.data());
        showToast(owned ? "Fond de profil retiré." : "Fond de profil attribué !");
      } catch (err) {
        showToast(friendlyError(err), true);
      }
    };
    bgGrid.appendChild(chip);
  });
  wrap.appendChild(bgGrid);

  const titleLabel = document.createElement("div");
  titleLabel.className = "manage-grid-label";
  titleLabel.textContent = "🎖️ Titres à attribuer";
  wrap.appendChild(titleLabel);

  const titleGrid = document.createElement("div");
  titleGrid.className = "chip-grid";
  getAllTitles({ includeUnpublished: true }).forEach((title) => {
    const owned = (targetProfile.title?.owned || []).includes(title.id);
    const chip = document.createElement("div");
    chip.className = "chip" + (owned ? " active" : "");
    chip.innerHTML = `
      <div class="chip-swatch" style="display:flex;align-items:center;justify-content:center;font-size:16px;">🎖️</div>
      <div class="chip-label">${escapeHtml(title.name)}</div>
      <div class="chip-sub">${owned ? "✅ Possédé" : "Donner"}</div>
    `;
    chip.onclick = async () => {
      try {
        const patch = {
          "title.owned": owned ? arrayRemove(title.id) : arrayUnion(title.id),
        };
        // Même logique que les décorations/fonds de profil : si on retire un
        // titre actuellement affiché par le joueur, on désactive aussi tout
        // de suite plutôt que de laisser "active" pointer vers un titre qu'il
        // ne possède plus.
        if (owned && targetProfile.title?.active === title.id) {
          patch["title.active"] = null;
        }
        await updateDoc(doc(db, "users", targetUid), patch);
        const snap = await getDoc(doc(db, "users", targetUid));
        await renderPlayerCard(targetUid, snap.data());
        showToast(owned ? "Titre retiré." : "Titre attribué !");
      } catch (err) {
        showToast(friendlyError(err), true);
      }
    };
    titleGrid.appendChild(chip);
  });
  if (!getAllTitles({ includeUnpublished: true }).length) {
    const p = document.createElement("p");
    p.className = "settings-note";
    p.textContent = "Aucun titre créé pour l'instant (crée-en dans « Espace organisateur » plus bas).";
    wrap.appendChild(p);
  } else {
    wrap.appendChild(titleGrid);
  }

  const themeLabel = document.createElement("div");
  themeLabel.className = "manage-grid-label";
  themeLabel.textContent = "🏆 Thèmes verrouillés à attribuer";
  wrap.appendChild(themeLabel);

  const themeGrid = document.createElement("div");
  themeGrid.className = "chip-grid";
  getAllThemes().filter((t) => t.locked).forEach((theme) => {
    const owned = (targetProfile.theme?.owned || []).includes(theme.id);
    const chip = document.createElement("div");
    chip.className = "chip" + (owned ? " active" : "");
    chip.innerHTML = `
      ${themeSwatchHtml(theme)}
      <div class="chip-label">${escapeHtml(theme.label || theme.name)}</div>
      <div class="chip-sub">${owned ? "✅ Possédé" : "Donner"}</div>
    `;
    chip.onclick = async () => {
      try {
        const patch = {
          "theme.owned": owned ? arrayRemove(theme.id) : arrayUnion(theme.id),
        };
        // Même logique que pour les décorations : si on retire le thème
        // actuellement choisi par le joueur, on le repasse sur "Classique"
        // (toujours débloqué pour tout le monde) plutôt que de laisser
        // "active" pointer vers un thème qu'il ne possède plus.
        if (owned && targetProfile.theme?.active === theme.id) {
          patch["theme.active"] = "classique";
        }
        await updateDoc(doc(db, "users", targetUid), patch);
        const snap = await getDoc(doc(db, "users", targetUid));
        await renderPlayerCard(targetUid, snap.data());
        showToast(owned ? "Thème retiré." : "Thème attribué !");
      } catch (err) {
        showToast(friendlyError(err), true);
      }
    };
    themeGrid.appendChild(chip);
  });
  wrap.appendChild(themeGrid);

  const tagLabel = document.createElement("div");
  tagLabel.className = "manage-grid-label";
  tagLabel.textContent = "🏷️ Tags à attribuer";
  wrap.appendChild(tagLabel);

  const tagGrid = document.createElement("div");
  tagGrid.className = "chip-grid";
  const grantableTags = getAllTags().filter((t) => !t.defaultOwned);
  if (!grantableTags.length) {
    const p = document.createElement("p");
    p.className = "settings-note";
    p.textContent = "Aucun tag à attribuer pour l'instant (crée-en dans « Espace organisateur » plus bas).";
    wrap.appendChild(p);
  } else {
    grantableTags.forEach((tag) => {
      const owned = (targetProfile.tags?.owned || []).includes(tag.id);
      const chip = document.createElement("div");
      chip.className = "chip" + (owned ? " active" : "");
      chip.innerHTML = `
        <div class="chip-swatch" style="background:${tag.color};"></div>
        <div class="chip-label">${tagLabelHtml(tag)}</div>
        <div class="chip-sub">${owned ? "✅ Possédé" : "Donner"}</div>
      `;
      chip.onclick = async () => {
        try {
          const patch = {
            "tags.owned": owned ? arrayRemove(tag.id) : arrayUnion(tag.id),
          };
          // Même logique que pour les décorations/thèmes : si on retire un
          // tag actuellement affiché par le joueur, on le retire aussi de
          // "active" dans la même écriture.
          if (owned && (targetProfile.tags?.active || []).includes(tag.id)) {
            patch["tags.active"] = arrayRemove(tag.id);
          }
          await updateDoc(doc(db, "users", targetUid), patch);
          const snap = await getDoc(doc(db, "users", targetUid));
          await renderPlayerCard(targetUid, snap.data());
          showToast(owned ? "Tag retiré." : "Tag attribué !");
        } catch (err) {
          showToast(friendlyError(err), true);
        }
      };
      tagGrid.appendChild(chip);
    });
    wrap.appendChild(tagGrid);
  }

  const pointsLabel = document.createElement("div");
  pointsLabel.className = "manage-grid-label";
  pointsLabel.textContent = "🎯 Points bonus (manuel)";
  wrap.appendChild(pointsLabel);

  const pointsNote = document.createElement("p");
  pointsNote.className = "settings-note";
  pointsNote.textContent =
    "Ajoute (ou retire, avec un nombre négatif) des points en dehors d'un duel — ex. participation à un événement spécial, geste commercial. Compte dans le total à vie du joueur, et dans son total de la saison en cours si une saison est active en ce moment.";
  wrap.appendChild(pointsNote);

  const adjustments = await fetchAdjustmentsForUid(targetUid);
  if (adjustments.length) {
    const histList = document.createElement("div");
    adjustments.forEach((adj) => {
      const row = document.createElement("div");
      row.className = "dd-row";
      const sign = adj.amount > 0 ? "+" : "";
      row.innerHTML = `
        <div class="dd-row-name">${sign}${adj.amount} pt${Math.abs(adj.amount) > 1 ? "s" : ""}${
        adj.reason ? ` — ${escapeHtml(adj.reason)}` : ""
      }${adj.seasonId ? "" : ' <span class="dd-pill">hors saison</span>'}</div>
        <div class="dd-row-actions">
          <button class="btn-mini btn-mini-no" type="button" data-id="${adj.id}">Supprimer</button>
        </div>
      `;
      row.querySelector("button").addEventListener("click", async () => {
        if (!confirm("Supprimer ce bonus de points ?")) return;
        try {
          await deletePointAdjustment(adj.id);
          const snap = await getDoc(doc(db, "users", targetUid));
          await renderPlayerCard(targetUid, snap.data());
          showToast("Bonus supprimé.");
        } catch (err) {
          showToast(friendlyError(err), true);
        }
      });
      histList.appendChild(row);
    });
    wrap.appendChild(histList);
  }

  const pointsForm = document.createElement("form");
  pointsForm.innerHTML = `
    <label for="points-adjust-amount-${targetUid}">Points à ajouter (négatif pour retirer)</label>
    <input type="number" id="points-adjust-amount-${targetUid}" step="1" required>
    <label for="points-adjust-reason-${targetUid}">Raison (optionnel)</label>
    <input type="text" id="points-adjust-reason-${targetUid}" maxlength="120" placeholder="Ex. tournoi spécial samedi">
    <button class="btn btn-primary" type="submit">Ajouter le bonus</button>
  `;
  pointsForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const amountInput = $(`#points-adjust-amount-${targetUid}`);
    const reasonInput = $(`#points-adjust-reason-${targetUid}`);
    const amount = parseInt(amountInput.value, 10);
    if (!Number.isFinite(amount) || amount === 0) {
      showToast("Indique un nombre de points (différent de 0).", true);
      return;
    }
    try {
      await addPointAdjustment(targetUid, amount, reasonInput.value.trim());
      const snap = await getDoc(doc(db, "users", targetUid));
      await renderPlayerCard(targetUid, snap.data());
      showToast("Bonus de points ajouté !");
    } catch (err) {
      showToast(friendlyError(err), true);
    }
  });
  wrap.appendChild(pointsForm);

  return wrap;
}

// ---------------------------------------------------------------------------
// Espace organisateur — création / modification des catalogues (décorations,
// thèmes, tags). Les règles Firestore revérifient toujours le rôle : ce code
// ne fait que préparer les écritures, jamais leur faire confiance seul.
// ---------------------------------------------------------------------------
let editingDecoId = null;
let editingDecoCurrent = null; // { imageDataUrl, type } de la décoration en cours de modification
let editingProfileBgId = null;
let editingProfileBgDataUrl = null; // image en cours (déjà enregistrée ou tout juste importée), ou null
let editingTitleId = null;
let editingThemeId = null;
let editingThemeBgDataUrl = null; // image de fond en cours (déjà enregistrée ou tout juste importée), ou null
let editingTagId = null;
let editingTagEmojiImageDataUrl = null; // emoji personnalisé (image) en cours, ou null

function renderOrganizerCatalogPanel() {
  const section = $("#section-organizer-catalog");
  if (!section) return;
  const isOrg = getCurrentProfile()?.role === "organisateur";
  section.style.display = isOrg ? "" : "none";
  if (!isOrg) return;
  renderDecoManageList();
  renderProfileBgManageList();
  renderTitleManageList();
  renderThemeManageList();
  renderTagManageList();
  renderGameManageList();
}

function renderDecoManageList() {
  const list = $("#admin-deco-list");
  if (!list) return;
  const custom = getAllDecorations({ includeUnpublished: true }).filter((d) => !d.builtin);
  list.innerHTML = custom.length ? "" : `<p class="settings-note">Aucune décoration créée pour l'instant.</p>`;
  custom.forEach((deco) => {
    const row = document.createElement("div");
    row.className = "admin-manage-row";

    const chip = document.createElement("div");
    chip.className = "chip" + (editingDecoId === deco.id ? " active" : "");
    chip.innerHTML = `
      ${decoSwatchHtml(deco)}
      <div class="chip-label">${escapeHtml(deco.name)}</div>
      <div class="chip-sub">${deco.type === "animated" ? "🎞️ Animée" : "Statique"} · ${deco.published ? "✅ Publiée" : "🔒 Non publiée"} · Modifier</div>
    `;
    chip.onclick = () => startEditDeco(deco);
    row.appendChild(chip);

    const actions = document.createElement("div");
    actions.className = "admin-manage-actions";

    const publishBtn = document.createElement("button");
    publishBtn.type = "button";
    publishBtn.className = "btn-small";
    publishBtn.textContent = deco.published ? "Dépublier" : "Publier";
    publishBtn.onclick = async (e) => {
      e.stopPropagation();
      try {
        await updateDecoration(deco.id, { published: !deco.published });
        showToast(deco.published ? "Décoration dépubliée (visible uniquement par toi)." : "Décoration publiée pour tout le monde !");
      } catch (err) {
        showToast(friendlyError(err), true);
      }
    };
    actions.appendChild(publishBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn-small btn-danger";
    deleteBtn.textContent = "Supprimer";
    deleteBtn.onclick = async (e) => {
      e.stopPropagation();
      if (!confirm(`Supprimer définitivement la décoration « ${deco.name} » ?`)) return;
      try {
        await deleteDecoration(deco.id);
        if (editingDecoId === deco.id) cancelEditDeco();
        showToast("Décoration supprimée.");
      } catch (err) {
        showToast(friendlyError(err), true);
      }
    };
    actions.appendChild(deleteBtn);

    row.appendChild(actions);
    list.appendChild(row);
  });
}

function startEditDeco(deco) {
  editingDecoId = deco.id;
  editingDecoCurrent = { imageDataUrl: deco.imageDataUrl, type: deco.type };
  $("#admin-deco-name").value = deco.name;
  $("#admin-deco-type").value = deco.type;
  $("#admin-deco-file").value = "";
  $("#admin-deco-submit").textContent = "Enregistrer les modifications";
  $("#admin-deco-cancel").style.display = "";
  renderDecoManageList();
  $("#form-admin-deco")?.scrollIntoView({ behavior: "smooth", block: "center" });
}
function cancelEditDeco() {
  editingDecoId = null;
  editingDecoCurrent = null;
  $("#form-admin-deco")?.reset();
  $("#admin-deco-submit").textContent = "Créer la décoration";
  $("#admin-deco-cancel").style.display = "none";
  renderDecoManageList();
}

async function handleAdminDecoSubmit(e) {
  e.preventDefault();
  const name = $("#admin-deco-name").value.trim();
  const type = $("#admin-deco-type").value;
  const file = $("#admin-deco-file").files?.[0];
  if (!name) {
    showToast("Donne un nom à la décoration.", true);
    return;
  }
  let imageDataUrl = editingDecoId ? editingDecoCurrent?.imageDataUrl || null : null;
  if (file) {
    try {
      if (type === "animated") {
        if (file.size > MAX_ANIMATED_DECO_BYTES) {
          showToast("Ce fichier est trop lourd (environ 900 Ko max) — choisis un gif plus léger.", true);
          return;
        }
        imageDataUrl = await fileToRawDataUrl(file);
      } else {
        imageDataUrl = await compressStaticDecoImage(file);
      }
    } catch (err) {
      showToast("Impossible de lire ce fichier.", true);
      return;
    }
  }
  if (!imageDataUrl) {
    showToast("Choisis une image pour cette décoration.", true);
    return;
  }
  try {
    if (editingDecoId) {
      await updateDecoration(editingDecoId, { name, type, imageDataUrl });
      showToast("Décoration modifiée !");
    } else {
      await createDecoration({ name, type, imageDataUrl });
      showToast("Décoration créée !");
    }
    cancelEditDeco();
  } catch (err) {
    showToast(friendlyError(err), true);
  }
}

function renderProfileBgManageList() {
  const list = $("#admin-profile-bg-list");
  if (!list) return;
  const all = getAllProfileBgs({ includeUnpublished: true });
  list.innerHTML = all.length ? "" : `<p class="settings-note">Aucun fond de profil créé pour l'instant.</p>`;
  all.forEach((bg) => {
    const row = document.createElement("div");
    row.className = "admin-manage-row";

    const chip = document.createElement("div");
    chip.className = "chip" + (editingProfileBgId === bg.id ? " active" : "");
    chip.innerHTML = `
      ${bgSwatchHtml(bg)}
      <div class="chip-label">${escapeHtml(bg.name)}</div>
      <div class="chip-sub">${bg.published ? "✅ Publié" : "🔒 Non publié"} · Modifier</div>
    `;
    chip.onclick = () => startEditProfileBg(bg);
    row.appendChild(chip);

    const actions = document.createElement("div");
    actions.className = "admin-manage-actions";

    const publishBtn = document.createElement("button");
    publishBtn.type = "button";
    publishBtn.className = "btn-small";
    publishBtn.textContent = bg.published ? "Dépublier" : "Publier";
    publishBtn.onclick = async (e) => {
      e.stopPropagation();
      try {
        await updateProfileBg(bg.id, { published: !bg.published });
        showToast(bg.published ? "Fond de profil dépublié (visible uniquement par toi)." : "Fond de profil publié pour tout le monde !");
      } catch (err) {
        showToast(friendlyError(err), true);
      }
    };
    actions.appendChild(publishBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn-small btn-danger";
    deleteBtn.textContent = "Supprimer";
    deleteBtn.onclick = async (e) => {
      e.stopPropagation();
      if (!confirm(`Supprimer définitivement le fond de profil « ${bg.name} » ?`)) return;
      try {
        await deleteProfileBg(bg.id);
        if (editingProfileBgId === bg.id) cancelEditProfileBg();
        showToast("Fond de profil supprimé.");
      } catch (err) {
        showToast(friendlyError(err), true);
      }
    };
    actions.appendChild(deleteBtn);

    row.appendChild(actions);
    list.appendChild(row);
  });
}

function updateProfileBgPreview() {
  const preview = $("#admin-profile-bg-preview");
  if (!preview) return;
  if (editingProfileBgDataUrl) {
    preview.src = editingProfileBgDataUrl;
    preview.style.display = "";
  } else {
    preview.removeAttribute("src");
    preview.style.display = "none";
  }
}

async function handleProfileBgFileChosen(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  if (file.size > 8_000_000) {
    showToast("Cette image est trop lourde à importer (8 Mo max avant compression).", true);
    return;
  }
  try {
    editingProfileBgDataUrl = await compressProfileBgImage(file);
    updateProfileBgPreview();
  } catch (err) {
    showToast("Impossible de lire cette image.", true);
  }
}

function startEditProfileBg(bg) {
  editingProfileBgId = bg.id;
  editingProfileBgDataUrl = bg.imageDataUrl || null;
  $("#admin-profile-bg-name").value = bg.name;
  $("#admin-profile-bg-file").value = "";
  updateProfileBgPreview();
  $("#admin-profile-bg-submit").textContent = "Enregistrer les modifications";
  $("#admin-profile-bg-cancel").style.display = "";
  renderProfileBgManageList();
  $("#form-admin-profile-bg")?.scrollIntoView({ behavior: "smooth", block: "center" });
}
function cancelEditProfileBg() {
  editingProfileBgId = null;
  editingProfileBgDataUrl = null;
  $("#form-admin-profile-bg")?.reset();
  updateProfileBgPreview();
  $("#admin-profile-bg-submit").textContent = "Créer le fond de profil";
  $("#admin-profile-bg-cancel").style.display = "none";
  renderProfileBgManageList();
}

async function handleAdminProfileBgSubmit(e) {
  e.preventDefault();
  const name = $("#admin-profile-bg-name").value.trim();
  if (!name) {
    showToast("Donne un nom au fond de profil.", true);
    return;
  }
  if (!editingProfileBgDataUrl) {
    showToast("Choisis une image pour ce fond de profil.", true);
    return;
  }
  try {
    if (editingProfileBgId) {
      await updateProfileBg(editingProfileBgId, { name, imageDataUrl: editingProfileBgDataUrl });
      showToast("Fond de profil modifié !");
    } else {
      await createProfileBg({ name, imageDataUrl: editingProfileBgDataUrl });
      showToast("Fond de profil créé !");
    }
    cancelEditProfileBg();
  } catch (err) {
    showToast(friendlyError(err), true);
  }
}

// ---------------------------------------------------------------------------
// Titres (Espace organisateur) — même fonctionnement publié/non publié que
// les fonds de profil ci-dessus, mais pas d'image à gérer (juste un nom).
// ---------------------------------------------------------------------------
function renderTitleManageList() {
  const list = $("#admin-title-list");
  if (!list) return;
  const all = getAllTitles({ includeUnpublished: true });
  list.innerHTML = all.length ? "" : `<p class="settings-note">Aucun titre créé pour l'instant.</p>`;
  all.forEach((title) => {
    const row = document.createElement("div");
    row.className = "admin-manage-row";

    const chip = document.createElement("div");
    chip.className = "chip" + (editingTitleId === title.id ? " active" : "");
    chip.innerHTML = `
      <div class="chip-swatch" style="display:flex;align-items:center;justify-content:center;font-size:16px;">🎖️</div>
      <div class="chip-label">${escapeHtml(title.name)}</div>
      <div class="chip-sub">${title.published ? "✅ Publié" : "🔒 Non publié"} · Modifier</div>
    `;
    chip.onclick = () => startEditTitle(title);
    row.appendChild(chip);

    const actions = document.createElement("div");
    actions.className = "admin-manage-actions";

    const publishBtn = document.createElement("button");
    publishBtn.type = "button";
    publishBtn.className = "btn-small";
    publishBtn.textContent = title.published ? "Dépublier" : "Publier";
    publishBtn.onclick = async (e) => {
      e.stopPropagation();
      try {
        await updateTitle(title.id, { published: !title.published });
        showToast(title.published ? "Titre dépublié (visible uniquement par toi)." : "Titre publié pour tout le monde !");
      } catch (err) {
        showToast(friendlyError(err), true);
      }
    };
    actions.appendChild(publishBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn-small btn-danger";
    deleteBtn.textContent = "Supprimer";
    deleteBtn.onclick = async (e) => {
      e.stopPropagation();
      if (!confirm(`Supprimer définitivement le titre « ${title.name} » ?`)) return;
      try {
        await deleteTitle(title.id);
        if (editingTitleId === title.id) cancelEditTitle();
        showToast("Titre supprimé.");
      } catch (err) {
        showToast(friendlyError(err), true);
      }
    };
    actions.appendChild(deleteBtn);

    row.appendChild(actions);
    list.appendChild(row);
  });
}

function startEditTitle(title) {
  editingTitleId = title.id;
  $("#admin-title-name").value = title.name;
  $("#admin-title-submit").textContent = "Enregistrer les modifications";
  $("#admin-title-cancel").style.display = "";
  renderTitleManageList();
  $("#form-admin-title")?.scrollIntoView({ behavior: "smooth", block: "center" });
}
function cancelEditTitle() {
  editingTitleId = null;
  $("#form-admin-title")?.reset();
  $("#admin-title-submit").textContent = "Créer le titre";
  $("#admin-title-cancel").style.display = "none";
  renderTitleManageList();
}

async function handleAdminTitleSubmit(e) {
  e.preventDefault();
  const name = $("#admin-title-name").value.trim();
  if (!name) {
    showToast("Donne un nom au titre.", true);
    return;
  }
  try {
    if (editingTitleId) {
      await updateTitle(editingTitleId, { name });
      showToast("Titre modifié !");
    } else {
      await createTitle({ name });
      showToast("Titre créé !");
    }
    cancelEditTitle();
  } catch (err) {
    showToast(friendlyError(err), true);
  }
}

const THEME_COLOR_DEFAULTS = {
  bg: "#0f1117", bg2: "#161a24", panel: "#1b202c", panelBorder: "#2a3142",
  accent: "#8b5cf6", accent2: "#f5b942", text: "#eef0f5", muted: "#93a0b8",
};
function themeColorFieldIds() {
  return {
    bg: "#admin-theme-bg", bg2: "#admin-theme-bg2", panel: "#admin-theme-panel",
    panelBorder: "#admin-theme-panelborder", accent: "#admin-theme-accent",
    accent2: "#admin-theme-accent2", text: "#admin-theme-text", muted: "#admin-theme-muted",
  };
}

function renderThemeManageList() {
  const list = $("#admin-theme-list");
  if (!list) return;
  const custom = getAllThemes().filter((t) => !t.builtin);
  list.innerHTML = custom.length ? "" : `<p class="settings-note">Aucun thème personnalisé créé pour l'instant.</p>`;
  custom.forEach((theme) => {
    const row = document.createElement("div");
    row.className = "admin-manage-row";

    const chip = document.createElement("div");
    chip.className = "chip" + (editingThemeId === theme.id ? " active" : "");
    chip.innerHTML = `
      ${themeSwatchHtml(theme)}
      <div class="chip-label">${escapeHtml(theme.name)}</div>
      <div class="chip-sub">${theme.bgImageDataUrl ? "🖼️ Fond perso · " : ""}Modifier</div>
    `;
    chip.onclick = () => startEditTheme(theme);
    row.appendChild(chip);

    const actions = document.createElement("div");
    actions.className = "admin-manage-actions";
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn-small btn-danger";
    deleteBtn.textContent = "Supprimer";
    deleteBtn.onclick = async (e) => {
      e.stopPropagation();
      if (!confirm(`Supprimer définitivement le thème « ${theme.name} » ?`)) return;
      try {
        await deleteTheme(theme.id);
        if (editingThemeId === theme.id) cancelEditTheme();
        showToast("Thème supprimé.");
      } catch (err) {
        showToast(friendlyError(err), true);
      }
    };
    actions.appendChild(deleteBtn);
    row.appendChild(actions);
    list.appendChild(row);
  });
}

function updateThemeBgPreview() {
  const preview = $("#admin-theme-bg-preview");
  const removeBtn = $("#admin-theme-bg-remove");
  if (!preview) return;
  if (editingThemeBgDataUrl) {
    preview.src = editingThemeBgDataUrl;
    preview.style.display = "";
    if (removeBtn) removeBtn.style.display = "";
  } else {
    preview.removeAttribute("src");
    preview.style.display = "none";
    if (removeBtn) removeBtn.style.display = "none";
  }
}

async function handleThemeBgFileChosen(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  if (file.size > 8_000_000) {
    showToast("Cette image est trop lourde à importer (8 Mo max avant compression).", true);
    return;
  }
  try {
    editingThemeBgDataUrl = await compressThemeBgImage(file);
    updateThemeBgPreview();
  } catch (err) {
    showToast("Impossible de lire cette image.", true);
  }
}

function handleThemeBgRemove() {
  editingThemeBgDataUrl = null;
  $("#admin-theme-bg-file").value = "";
  updateThemeBgPreview();
}

function startEditTheme(theme) {
  editingThemeId = theme.id;
  $("#admin-theme-name").value = theme.name;
  const fields = themeColorFieldIds();
  const c = theme.colors || {};
  Object.keys(fields).forEach((key) => {
    $(fields[key]).value = c[key] || THEME_COLOR_DEFAULTS[key];
  });
  editingThemeBgDataUrl = theme.bgImageDataUrl || null;
  $("#admin-theme-bg-file").value = "";
  updateThemeBgPreview();
  $("#admin-theme-submit").textContent = "Enregistrer les modifications";
  $("#admin-theme-cancel").style.display = "";
  renderThemeManageList();
  $("#form-admin-theme")?.scrollIntoView({ behavior: "smooth", block: "center" });
}
function cancelEditTheme() {
  editingThemeId = null;
  $("#form-admin-theme")?.reset();
  const fields = themeColorFieldIds();
  Object.keys(fields).forEach((key) => ($(fields[key]).value = THEME_COLOR_DEFAULTS[key]));
  editingThemeBgDataUrl = null;
  updateThemeBgPreview();
  $("#admin-theme-submit").textContent = "Créer le thème";
  $("#admin-theme-cancel").style.display = "none";
  renderThemeManageList();
}

async function handleAdminThemeSubmit(e) {
  e.preventDefault();
  const name = $("#admin-theme-name").value.trim();
  if (!name) {
    showToast("Donne un nom au thème.", true);
    return;
  }
  const fields = themeColorFieldIds();
  const colors = {};
  Object.keys(fields).forEach((key) => (colors[key] = $(fields[key]).value));
  try {
    if (editingThemeId) {
      await updateTheme(editingThemeId, { name, colors, bgImageDataUrl: editingThemeBgDataUrl || null });
      showToast("Thème modifié !");
    } else {
      await createTheme({ name, colors, bgImageDataUrl: editingThemeBgDataUrl || null });
      showToast("Thème créé !");
    }
    cancelEditTheme();
  } catch (err) {
    showToast(friendlyError(err), true);
  }
}

function renderTagManageList() {
  const list = $("#admin-tag-list");
  if (!list) return;
  const tags = getAllTags();
  list.innerHTML = tags.length ? "" : `<p class="settings-note">Aucun tag créé pour l'instant.</p>`;
  tags.forEach((tag) => {
    const row = document.createElement("div");
    row.className = "admin-manage-row";

    const chip = document.createElement("div");
    chip.className = "chip" + (editingTagId === tag.id ? " active" : "");
    chip.innerHTML = `
      <div class="chip-swatch" style="background:${tag.color};"></div>
      <div class="chip-label">${tagLabelHtml(tag)}</div>
      <div class="chip-sub">${tag.defaultOwned ? "Par défaut · " : ""}${tag.referralReward ? "🎁 Récompense parrainage · " : ""}Modifier</div>
    `;
    chip.onclick = () => startEditTag(tag);
    row.appendChild(chip);

    const actions = document.createElement("div");
    actions.className = "admin-manage-actions";
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn-small btn-danger";
    deleteBtn.textContent = "Supprimer";
    deleteBtn.onclick = async (e) => {
      e.stopPropagation();
      if (!confirm(`Supprimer définitivement le tag « ${tag.name} » ?`)) return;
      try {
        await deleteTag(tag.id);
        if (editingTagId === tag.id) cancelEditTag();
        showToast("Tag supprimé.");
      } catch (err) {
        showToast(friendlyError(err), true);
      }
    };
    actions.appendChild(deleteBtn);
    row.appendChild(actions);
    list.appendChild(row);
  });
}

function updateTagEmojiPreview() {
  const preview = $("#admin-tag-emoji-preview");
  const removeBtn = $("#admin-tag-emoji-remove");
  if (!preview) return;
  if (editingTagEmojiImageDataUrl) {
    preview.src = editingTagEmojiImageDataUrl;
    preview.style.display = "";
    if (removeBtn) removeBtn.style.display = "";
  } else {
    preview.removeAttribute("src");
    preview.style.display = "none";
    if (removeBtn) removeBtn.style.display = "none";
  }
}

async function handleTagEmojiFileChosen(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  if (file.size > 8_000_000) {
    showToast("Cette image est trop lourde à importer (8 Mo max avant compression).", true);
    return;
  }
  try {
    if (file.type === "image/gif") {
      // Gif animé : gardé tel quel (un recadrage/une recompression via
      // canvas "gèlerait" l'animation sur une seule image), juste
      // plafonné en taille — comme les décorations animées.
      if (file.size > MAX_ANIMATED_TAG_EMOJI_BYTES) {
        showToast("Ce gif animé est trop lourd (environ 300 Ko max) — choisis-en un plus léger.", true);
        return;
      }
      editingTagEmojiImageDataUrl = await fileToRawDataUrl(file);
    } else {
      editingTagEmojiImageDataUrl = await compressTagEmojiImage(file);
    }
    updateTagEmojiPreview();
  } catch (err) {
    showToast("Impossible de lire cette image.", true);
  }
}

function handleTagEmojiRemove() {
  editingTagEmojiImageDataUrl = null;
  $("#admin-tag-emoji-file").value = "";
  updateTagEmojiPreview();
}

function startEditTag(tag) {
  editingTagId = tag.id;
  $("#admin-tag-name").value = tag.name;
  $("#admin-tag-color").value = tag.color;
  $("#admin-tag-emoji").value = tag.emoji || "";
  $("#admin-tag-default").checked = !!tag.defaultOwned;
  $("#admin-tag-referral").checked = !!tag.referralReward;
  editingTagEmojiImageDataUrl = tag.emojiImageDataUrl || null;
  $("#admin-tag-emoji-file").value = "";
  updateTagEmojiPreview();
  $("#admin-tag-submit").textContent = "Enregistrer les modifications";
  $("#admin-tag-cancel").style.display = "";
  renderTagManageList();
  $("#form-admin-tag")?.scrollIntoView({ behavior: "smooth", block: "center" });
}
function cancelEditTag() {
  editingTagId = null;
  $("#form-admin-tag")?.reset();
  $("#admin-tag-color").value = "#8b5cf6";
  $("#admin-tag-emoji").value = "";
  editingTagEmojiImageDataUrl = null;
  updateTagEmojiPreview();
  $("#admin-tag-submit").textContent = "Créer le tag";
  $("#admin-tag-cancel").style.display = "none";
  renderTagManageList();
}

async function handleAdminTagSubmit(e) {
  e.preventDefault();
  const name = $("#admin-tag-name").value.trim();
  const color = $("#admin-tag-color").value;
  const emoji = $("#admin-tag-emoji").value.trim();
  const defaultOwned = $("#admin-tag-default").checked;
  const referralReward = $("#admin-tag-referral")?.checked || false;
  if (!name) {
    showToast("Donne un nom au tag.", true);
    return;
  }
  try {
    if (editingTagId) {
      await updateTag(editingTagId, {
        name,
        color,
        emoji: emoji || null,
        defaultOwned,
        referralReward,
        emojiImageDataUrl: editingTagEmojiImageDataUrl || null,
      });
      showToast("Tag modifié !");
    } else {
      await createTag({ name, color, emoji, defaultOwned, referralReward, emojiImageDataUrl: editingTagEmojiImageDataUrl });
      showToast("Tag créé !");
    }
    cancelEditTag();
  } catch (err) {
    showToast(friendlyError(err), true);
  }
}

// ---------------------------------------------------------------------------
// Jeux (TCG) — le NOM d'un jeu n'est jamais modifiable une fois créé (juste
// ajout), comme les autres catalogues. En revanche, chaque jeu — y compris
// les jeux "d'origine" (Pokémon, Lorcana, One Piece...) — peut recevoir une
// "condition pour gagner" facultative : soit un score à atteindre ("Point
// maximal"), soit des points de vie de départ ("Point de défaite", le but
// étant d'éliminer l'adversaire). Cette info est purement indicative — elle
// sert à afficher un rappel pendant le Duel du jour et, surtout, de base au
// calcul des "points cumulés" de la saison (voir season.js).
// ---------------------------------------------------------------------------
let editingGameName = null;

function toggleEditGame(name) {
  editingGameName = editingGameName === name ? null : name;
  renderGameManageList();
}

function buildGameWinConditionForm(name, wc) {
  const form = document.createElement("form");
  form.className = "admin-game-wc-form";

  const select = document.createElement("select");
  select.innerHTML = `
    <option value="point_maximal">Point maximal (score à atteindre)</option>
    <option value="point_defaite">Point de défaite (points de vie de départ)</option>
  `;
  select.value = wc?.type || "point_maximal";

  const valueInput = document.createElement("input");
  valueInput.type = "number";
  valueInput.min = "1";
  valueInput.required = true;
  valueInput.placeholder = "Valeur";
  valueInput.value = wc?.value ?? "";

  const saveBtn = document.createElement("button");
  saveBtn.type = "submit";
  saveBtn.className = "btn-small btn-primary";
  saveBtn.textContent = "Enregistrer";

  form.appendChild(select);
  form.appendChild(valueInput);
  form.appendChild(saveBtn);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const value = Number(valueInput.value);
    if (!value || value <= 0) {
      showToast("Indique une valeur supérieure à 0.", true);
      return;
    }
    try {
      await setGameWinCondition(name, select.value, value);
      editingGameName = null;
      showToast("Condition de victoire enregistrée !");
      renderGameManageList();
    } catch (err) {
      showToast(friendlyError(err), true);
    }
  });

  return form;
}

// Section "Éléments" d'un jeu (ex. les couleurs d'encre à Lorcana) — un
// joueur devra en cocher un ou plusieurs pour déclarer son deck au moment
// de jouer à ce jeu (voir daily-duel.js/event.js), UNIQUEMENT si au moins un
// élément est configuré ici (sinon rien n'est demandé, ça reste facultatif).
let pendingElementImageDataUrl = null;

function buildGameElementsSection(name) {
  const wrap = document.createElement("div");
  wrap.className = "admin-game-elements";

  const label = document.createElement("div");
  label.className = "manage-grid-label";
  label.textContent = "🧩 Éléments (couleurs/types de deck)";
  wrap.appendChild(label);

  const elements = getGameElements(name);
  if (elements.length) {
    const grid = document.createElement("div");
    grid.className = "chip-grid";
    elements.forEach((el) => {
      const chip = document.createElement("div");
      chip.className = "chip";
      chip.innerHTML = `
        <div class="chip-swatch" style="background-image:url('${el.imageDataUrl}');background-size:cover;background-position:center;"></div>
        <div class="chip-label">${escapeHtml(el.name)}</div>
      `;
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "btn-small";
      removeBtn.textContent = "Retirer";
      removeBtn.onclick = async (e) => {
        e.stopPropagation();
        try {
          await removeGameElement(name, el.id);
          showToast("Élément retiré.");
          renderGameManageList();
        } catch (err) {
          showToast(friendlyError(err), true);
        }
      };
      chip.appendChild(removeBtn);
      grid.appendChild(chip);
    });
    wrap.appendChild(grid);
  } else {
    const note = document.createElement("p");
    note.className = "settings-note";
    note.textContent = "Aucun élément configuré pour l'instant — tant qu'il n'y en a aucun, les joueurs n'ont rien à déclarer pour ce jeu.";
    wrap.appendChild(note);
  }

  pendingElementImageDataUrl = null;
  const form = document.createElement("form");
  form.className = "admin-game-element-form";
  form.innerHTML = `
    <label>Nom de l'élément</label>
    <input type="text" class="admin-element-name" maxlength="24" required>
    <label>Icône (image)</label>
    <input type="file" class="admin-element-file" accept="image/*">
    <img class="admin-element-preview" alt="Aperçu de l'élément" style="display:none;max-width:64px;max-height:64px;border-radius:50%;margin:6px 0;">
    <button type="button" class="btn btn-ghost admin-element-template-btn">⬇️ Télécharger le gabarit (512×512)</button>
    <button type="submit" class="btn btn-small btn-primary">Ajouter l'élément</button>
  `;
  const fileInput = form.querySelector(".admin-element-file");
  const preview = form.querySelector(".admin-element-preview");
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      pendingElementImageDataUrl = await compressGameElementImage(file);
      preview.src = pendingElementImageDataUrl;
      preview.style.display = "";
    } catch (err) {
      showToast(friendlyError(err), true);
    }
  });
  form.querySelector(".admin-element-template-btn").addEventListener("click", downloadGameElementTemplate);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const elName = form.querySelector(".admin-element-name").value.trim();
    if (!elName) {
      showToast("Donne un nom à l'élément.", true);
      return;
    }
    if (!pendingElementImageDataUrl) {
      showToast("Choisis une icône pour cet élément.", true);
      return;
    }
    try {
      await addGameElement(name, { name: elName, imageDataUrl: pendingElementImageDataUrl });
      showToast("Élément ajouté !");
      renderGameManageList();
    } catch (err) {
      showToast(friendlyError(err), true);
    }
  });
  wrap.appendChild(form);

  return wrap;
}

function renderGameManageList() {
  const list = $("#admin-game-list");
  if (!list) return;
  list.innerHTML = "";
  getAllGames().forEach((name) => {
    const wc = getGameWinCondition(name);
    const elementCount = getGameElements(name).length;
    const row = document.createElement("div");
    row.className = "admin-manage-row";

    const chip = document.createElement("div");
    chip.className = "chip" + (editingGameName === name ? " active" : "");
    chip.innerHTML = `
      <div class="chip-label">${escapeHtml(name)}</div>
      <div class="chip-sub">${wc ? escapeHtml(winConditionLabel(wc)) : "Aucune condition de victoire définie"} — ${elementCount ? `${elementCount} élément${elementCount > 1 ? "s" : ""}` : "aucun élément"}</div>
    `;
    chip.onclick = () => toggleEditGame(name);
    row.appendChild(chip);

    const actions = document.createElement("div");
    actions.className = "admin-manage-actions";
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn-small";
    editBtn.textContent = editingGameName === name ? "Fermer" : "Paramètres du jeu";
    editBtn.onclick = (e) => {
      e.stopPropagation();
      toggleEditGame(name);
    };
    actions.appendChild(editBtn);
    row.appendChild(actions);

    list.appendChild(row);
    if (editingGameName === name) {
      list.appendChild(buildGameWinConditionForm(name, wc));
      list.appendChild(buildGameElementsSection(name));
    }
  });
}

async function handleAdminGameSubmit(e) {
  e.preventDefault();
  const name = $("#admin-game-name").value.trim();
  if (!name) {
    showToast("Donne un nom au jeu.", true);
    return;
  }
  const already = getAllGames().some((g) => g.toLowerCase() === name.toLowerCase());
  if (already) {
    showToast("Ce jeu existe déjà.", true);
    return;
  }
  try {
    await createGame(name);
    $("#form-admin-game")?.reset();
    showToast("Jeu ajouté !");
  } catch (err) {
    showToast(friendlyError(err), true);
  }
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
  $("#btn-open-organizer-catalog")?.addEventListener("click", renderOrganizerCatalogPanel);

  $("#form-change-pseudo").addEventListener("submit", handleSavePseudo);
  $("#form-change-password").addEventListener("submit", handleChangePassword);

  $("#settings-photo-input").addEventListener("change", handlePhotoChosen);
  $("#btn-recrop-photo").addEventListener("click", handleRecropExisting);
  $("#btn-save-photo").addEventListener("click", handleSavePhoto);
  $("#btn-remove-photo").addEventListener("click", handleRemovePhoto);
  ["#photo-zoom", "#photo-pan-x", "#photo-pan-y"].forEach((sel) => {
    $(sel).addEventListener("input", updateCropperTransform);
  });

  $("#form-search-player").addEventListener("submit", handleSearchPlayer);

  $("#form-admin-deco")?.addEventListener("submit", handleAdminDecoSubmit);
  $("#admin-deco-cancel")?.addEventListener("click", cancelEditDeco);
  $("#btn-download-deco-template")?.addEventListener("click", downloadDecorationTemplate);
  $("#form-admin-profile-bg")?.addEventListener("submit", handleAdminProfileBgSubmit);
  $("#admin-profile-bg-cancel")?.addEventListener("click", cancelEditProfileBg);
  $("#admin-profile-bg-file")?.addEventListener("change", handleProfileBgFileChosen);
  $("#btn-download-profile-bg-template")?.addEventListener("click", downloadProfileBgTemplate);
  $("#form-admin-title")?.addEventListener("submit", handleAdminTitleSubmit);
  $("#admin-title-cancel")?.addEventListener("click", cancelEditTitle);
  $("#form-admin-theme")?.addEventListener("submit", handleAdminThemeSubmit);
  $("#admin-theme-cancel")?.addEventListener("click", cancelEditTheme);
  $("#admin-theme-bg-file")?.addEventListener("change", handleThemeBgFileChosen);
  $("#admin-theme-bg-remove")?.addEventListener("click", handleThemeBgRemove);
  $("#btn-download-theme-bg-template")?.addEventListener("click", downloadThemeBgTemplate);
  $("#form-admin-tag")?.addEventListener("submit", handleAdminTagSubmit);
  $("#admin-tag-cancel")?.addEventListener("click", cancelEditTag);
  $("#admin-tag-emoji-file")?.addEventListener("change", handleTagEmojiFileChosen);
  $("#admin-tag-emoji-remove")?.addEventListener("click", handleTagEmojiRemove);
  $("#btn-download-tag-emoji-template")?.addEventListener("click", downloadTagEmojiTemplate);
  $("#form-admin-game")?.addEventListener("submit", handleAdminGameSubmit);

  // Les catalogues (décorations/thèmes/tags) peuvent changer pendant que
  // l'écran Paramètres est ouvert (une création vient de l'organisateur
  // lui-même, ou d'un autre appareil) : on rafraîchit les grilles concernées
  // à chaque mise à jour, uniquement si cet écran est bien affiché.
  document.addEventListener("cartech:catalogs", () => {
    const profile = getCurrentProfile();
    if (profile && $("#view-settings")?.classList.contains("active")) {
      renderDecorationsGrid(profile);
      renderProfileBgGrid(profile);
      renderTitlesGrid(profile);
      renderThemesGrid(profile);
      renderTagsGrid(profile);
    }
    if ($("#view-organizer-catalog")?.classList.contains("active")) {
      renderOrganizerCatalogPanel();
    }
  });

  // Ouvert depuis la fenêtre "Voir le profil" quand l'organisateur clique
  // sur "Gérer ce joueur →" (voir app.js) : bascule vers l'écran Paramètres,
  // recherche déjà faite.
  document.addEventListener("cartech:manage-player", (e) => {
    if (e.detail?.uid) showPlayerProfileScreen(e.detail.uid);
  });

  $("#btn-delete-account").addEventListener("click", openDeleteStep1);
  $("#btn-delete-cancel-1").addEventListener("click", () => closeModal("overlay-delete-step1"));
  $("#btn-delete-continue").addEventListener("click", openDeleteStep2);
  $("#btn-delete-cancel-2").addEventListener("click", () => closeModal("overlay-delete-step2"));
  $("#delete-code-input").addEventListener("input", checkDeleteCodeMatch);
  $("#btn-delete-confirm").addEventListener("click", handleConfirmDeletePassword);
  $("#btn-delete-reauth-google").addEventListener("click", handleConfirmDeleteGoogle);
});
