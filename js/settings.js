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
import {
  getAllDecorations,
  getAllThemes,
  getAllTags,
  usableTagsFor,
  isTagUsable,
  findAnyTag,
  applyThemeLive,
  contrastTextColor,
  compressStaticDecoImage,
  fileToRawDataUrl,
  MAX_ANIMATED_DECO_BYTES,
  createDecoration,
  updateDecoration,
  createTheme,
  updateTheme,
  createTag,
  updateTag,
} from "./live-catalog.js";

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
  renderThemesGrid(profile);
  renderTagsGrid(profile);
  renderOrganizerCatalogPanel();

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

  const noneChip = document.createElement("div");
  noneChip.className = "chip" + (active === null ? " active" : "");
  noneChip.innerHTML = `<div class="chip-swatch" style="background:var(--bg2);border:1px dashed var(--panel-border);"></div><div class="chip-label">Aucune</div>`;
  noneChip.onclick = () => setActiveDecoration(null);
  grid.appendChild(noneChip);

  getAllDecorations().forEach((deco) => {
    const isOwned = owned.includes(deco.id);
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

  getAllThemes().forEach((theme) => {
    const isOwned = owned.includes(theme.id);
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

  usable.forEach((tag) => {
    const isActive = active.includes(tag.id);
    const chip = document.createElement("div");
    chip.className = "chip" + (isActive ? " active" : "");
    chip.innerHTML = `
      <div class="chip-swatch" style="background:${tag.color};"></div>
      <div class="chip-label">${escapeHtml(tag.name)}</div>
      <div class="chip-sub">${isActive ? "✅ Affiché" : "Toucher pour afficher"}</div>
    `;
    chip.onclick = () => toggleActiveTag(tag.id);
    grid.appendChild(chip);
  });
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
  const activeTags = (targetProfile.tags?.active || []).map((id) => findAnyTag(id)).filter(Boolean);
  if (activeTags.length) {
    tags.innerHTML = activeTags
      .map(
        (t) =>
          `<span class="tag-pill" style="background:${t.color};color:${contrastTextColor(t.color)};">${escapeHtml(t.name)}</span>`
      )
      .join(" ");
  } else {
    tags.textContent = "Aucun tag affiché.";
  }
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
  getAllDecorations().forEach((deco) => {
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
        <div class="chip-label">${escapeHtml(tag.name)}</div>
        <div class="chip-sub">${owned ? "✅ Possédé" : "Donner"}</div>
      `;
      chip.onclick = async () => {
        try {
          await updateDoc(doc(db, "users", targetUid), {
            "tags.owned": owned ? arrayRemove(tag.id) : arrayUnion(tag.id),
          });
          const snap = await getDoc(doc(db, "users", targetUid));
          renderPlayerCard(targetUid, snap.data());
          showToast(owned ? "Tag retiré." : "Tag attribué !");
        } catch (err) {
          showToast(friendlyError(err), true);
        }
      };
      tagGrid.appendChild(chip);
    });
    wrap.appendChild(tagGrid);
  }

  return wrap;
}

// ---------------------------------------------------------------------------
// Espace organisateur — création / modification des catalogues (décorations,
// thèmes, tags). Les règles Firestore revérifient toujours le rôle : ce code
// ne fait que préparer les écritures, jamais leur faire confiance seul.
// ---------------------------------------------------------------------------
let editingDecoId = null;
let editingDecoCurrent = null; // { imageDataUrl, type } de la décoration en cours de modification
let editingThemeId = null;
let editingTagId = null;

function renderOrganizerCatalogPanel() {
  const section = $("#section-organizer-catalog");
  if (!section) return;
  const isOrg = getCurrentProfile()?.role === "organisateur";
  section.style.display = isOrg ? "" : "none";
  if (!isOrg) return;
  renderDecoManageList();
  renderThemeManageList();
  renderTagManageList();
}

function renderDecoManageList() {
  const list = $("#admin-deco-list");
  if (!list) return;
  const custom = getAllDecorations().filter((d) => !d.builtin);
  list.innerHTML = custom.length ? "" : `<p class="settings-note">Aucune décoration créée pour l'instant.</p>`;
  custom.forEach((deco) => {
    const chip = document.createElement("div");
    chip.className = "chip" + (editingDecoId === deco.id ? " active" : "");
    chip.innerHTML = `
      ${decoSwatchHtml(deco)}
      <div class="chip-label">${escapeHtml(deco.name)}</div>
      <div class="chip-sub">${deco.type === "animated" ? "🎞️ Animée" : "Statique"} · Modifier</div>
    `;
    chip.onclick = () => startEditDeco(deco);
    list.appendChild(chip);
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
    const chip = document.createElement("div");
    chip.className = "chip" + (editingThemeId === theme.id ? " active" : "");
    chip.innerHTML = `
      ${themeSwatchHtml(theme)}
      <div class="chip-label">${escapeHtml(theme.name)}</div>
      <div class="chip-sub">Modifier</div>
    `;
    chip.onclick = () => startEditTheme(theme);
    list.appendChild(chip);
  });
}

function startEditTheme(theme) {
  editingThemeId = theme.id;
  $("#admin-theme-name").value = theme.name;
  const fields = themeColorFieldIds();
  const c = theme.colors || {};
  Object.keys(fields).forEach((key) => {
    $(fields[key]).value = c[key] || THEME_COLOR_DEFAULTS[key];
  });
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
      await updateTheme(editingThemeId, { name, colors });
      showToast("Thème modifié !");
    } else {
      await createTheme({ name, colors });
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
    const chip = document.createElement("div");
    chip.className = "chip" + (editingTagId === tag.id ? " active" : "");
    chip.innerHTML = `
      <div class="chip-swatch" style="background:${tag.color};"></div>
      <div class="chip-label">${escapeHtml(tag.name)}</div>
      <div class="chip-sub">${tag.defaultOwned ? "Par défaut · " : ""}Modifier</div>
    `;
    chip.onclick = () => startEditTag(tag);
    list.appendChild(chip);
  });
}

function startEditTag(tag) {
  editingTagId = tag.id;
  $("#admin-tag-name").value = tag.name;
  $("#admin-tag-color").value = tag.color;
  $("#admin-tag-default").checked = !!tag.defaultOwned;
  $("#admin-tag-submit").textContent = "Enregistrer les modifications";
  $("#admin-tag-cancel").style.display = "";
  renderTagManageList();
  $("#form-admin-tag")?.scrollIntoView({ behavior: "smooth", block: "center" });
}
function cancelEditTag() {
  editingTagId = null;
  $("#form-admin-tag")?.reset();
  $("#admin-tag-color").value = "#8b5cf6";
  $("#admin-tag-submit").textContent = "Créer le tag";
  $("#admin-tag-cancel").style.display = "none";
  renderTagManageList();
}

async function handleAdminTagSubmit(e) {
  e.preventDefault();
  const name = $("#admin-tag-name").value.trim();
  const color = $("#admin-tag-color").value;
  const defaultOwned = $("#admin-tag-default").checked;
  if (!name) {
    showToast("Donne un nom au tag.", true);
    return;
  }
  try {
    if (editingTagId) {
      await updateTag(editingTagId, { name, color, defaultOwned });
      showToast("Tag modifié !");
    } else {
      await createTag({ name, color, defaultOwned });
      showToast("Tag créé !");
    }
    cancelEditTag();
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
  $("#form-admin-theme")?.addEventListener("submit", handleAdminThemeSubmit);
  $("#admin-theme-cancel")?.addEventListener("click", cancelEditTheme);
  $("#form-admin-tag")?.addEventListener("submit", handleAdminTagSubmit);
  $("#admin-tag-cancel")?.addEventListener("click", cancelEditTag);

  // Les catalogues (décorations/thèmes/tags) peuvent changer pendant que
  // l'écran Paramètres est ouvert (une création vient de l'organisateur
  // lui-même, ou d'un autre appareil) : on rafraîchit les grilles concernées
  // à chaque mise à jour, uniquement si cet écran est bien affiché.
  document.addEventListener("cartech:catalogs", () => {
    if (!$("#view-settings")?.classList.contains("active")) return;
    const profile = getCurrentProfile();
    if (!profile) return;
    renderDecorationsGrid(profile);
    renderThemesGrid(profile);
    renderTagsGrid(profile);
    renderOrganizerCatalogPanel();
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
