// ============================================================================
// Car'Tech Arena — catalogues créés par l'organisateur en direct
// (décorations de photo de profil, thèmes personnalisés, tags de profil).
//
// Ces catalogues s'ajoutent aux décorations/thèmes "de base" définis dans
// catalog.js (qui restent toujours disponibles, inchangés) — ce module ne
// fait que fusionner les deux à l'affichage, et fournit les actions de
// création/modification réservées à l'organisateur (les règles Firestore
// revérifient toujours le rôle côté serveur, ce module ne fait "confiance"
// à rien côté client).
// ============================================================================
import {
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  onSnapshot,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import { db } from "./firebase-init.js";
import { DECORATIONS, THEMES, findTheme, GAMES } from "./catalog.js";

const decorationsCol = collection(db, "decorations");
const themesCol = collection(db, "themes");
const tagsCol = collection(db, "tags");
const gamesCol = collection(db, "games");

let liveDecorations = [];
let liveThemes = [];
let liveTags = [];
let liveGames = [];
let started = false;
let listeners = [];

// Taille max d'une image de décoration statique après compression, et d'une
// décoration animée (gif) telle quelle (pas de recompression possible côté
// client sans perdre l'animation) — marge de sécurité sous 1 Mo/document.
export const MAX_STATIC_DECO_BYTES = 350_000;
export const MAX_ANIMATED_DECO_BYTES = 900_000;
// Image de fond de thème : plus grande (pleine page), donc marge un peu plus
// large que les décorations mais toujours bien sous la limite de 1 Mo par
// document Firestore.
export const MAX_THEME_BG_BYTES = 700_000;

// ---------------------------------------------------------------------------
// Écoute temps réel — démarrée une seule fois après connexion (voir app.js)
// ---------------------------------------------------------------------------
export function startLiveCatalogs(onUpdate) {
  if (started) return;
  started = true;
  listeners.push(
    onSnapshot(decorationsCol, (snap) => {
      liveDecorations = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      onUpdate?.();
      document.dispatchEvent(new CustomEvent("cartech:catalogs"));
    })
  );
  listeners.push(
    onSnapshot(themesCol, (snap) => {
      liveThemes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      onUpdate?.();
      document.dispatchEvent(new CustomEvent("cartech:catalogs"));
    })
  );
  listeners.push(
    onSnapshot(tagsCol, (snap) => {
      liveTags = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      onUpdate?.();
      document.dispatchEvent(new CustomEvent("cartech:catalogs"));
    })
  );
  listeners.push(
    onSnapshot(gamesCol, (snap) => {
      liveGames = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      onUpdate?.();
      document.dispatchEvent(new CustomEvent("cartech:catalogs"));
    })
  );
}

export function stopLiveCatalogs() {
  listeners.forEach((unsub) => unsub());
  listeners = [];
  liveDecorations = [];
  liveThemes = [];
  liveTags = [];
  liveGames = [];
  started = false;
}

// ---------------------------------------------------------------------------
// Listes fusionnées (catalogue de base + créations de l'organisateur)
// ---------------------------------------------------------------------------
// Une décoration créée par l'organisateur démarre "non publiée" (visible
// seulement dans l'Espace organisateur, pour la préparer tranquillement) et
// doit être explicitement "Publiée" pour apparaître à tout le monde (comme
// décoration verrouillée, à attribuer) — voir buildOrganizerManagePanel et
// renderDecoManageList dans settings.js. Par défaut, getAllDecorations()
// masque donc les décorations non publiées ; passer includeUnpublished:true
// uniquement pour l'affichage de gestion réservé à l'organisateur.
export function getAllDecorations({ includeUnpublished = false } = {}) {
  const builtins = DECORATIONS.map((d) => ({ ...d, builtin: true, type: "static" }));
  const custom = liveDecorations
    .filter((d) => includeUnpublished || d.published)
    .map((d) => ({ ...d, builtin: false }));
  return [...builtins, ...custom];
}
export function getAllThemes() {
  const builtins = THEMES.map((t) => ({ ...t, builtin: true }));
  const custom = liveThemes.map((t) => ({ ...t, builtin: false, locked: true }));
  return [...builtins, ...custom];
}
export function getAllTags() {
  return liveTags.slice();
}
// Les jeux sont de simples chaînes (pas besoin d'id/couleur/image) : la
// liste fusionne les jeux "de base" de catalog.js avec les noms ajoutés par
// l'organisateur depuis l'appli, dans l'ordre d'ajout.
// Un document de "games" peut désormais exister uniquement pour porter la
// configuration de condition de victoire d'un jeu de base (voir
// getGameWinCondition ci-dessous) — un tel document n'a pas de champ "name"
// et ne doit donc jamais apparaître comme un jeu supplémentaire ici.
export function getAllGames() {
  return [...GAMES, ...liveGames.filter((g) => g.name).map((g) => g.name)];
}

// Condition de victoire configurée pour un jeu (de base ou personnalisé) —
// stockée dans le document Firestore "games/{nomDuJeu}" (l'id du document
// est le nom exact du jeu, ce qui permet aux jeux de base — jamais stockés
// auparavant — d'avoir eux aussi un document, uniquement pour porter ce
// champ). Retourne null si rien n'a encore été configuré : c'est une
// information facultative, purement informative.
export function getGameWinCondition(name) {
  return liveGames.find((g) => g.id === name)?.winCondition || null;
}

// Enregistre/met à jour la condition de victoire d'un jeu. { merge: true }
// est indispensable ici : pour un jeu de base, ce document n'a pas
// forcément de champ "name" (voir getAllGames ci-dessus) et on ne veut
// surtout pas l'écraser (ni écraser un futur champ ajouté plus tard).
export async function setGameWinCondition(name, type, value) {
  await setDoc(
    doc(gamesCol, name),
    { winCondition: { type, value: Number(value) } },
    { merge: true }
  );
}

export function winConditionLabel(wc) {
  if (!wc) return null;
  if (wc.type === "point_maximal") return `Objectif : ${wc.value} points`;
  if (wc.type === "point_defaite") return `Points de vie de départ : ${wc.value} (éliminer l'adversaire)`;
  return null;
}

// Toujours résoudre la décoration même si elle n'est plus publiée : sinon un
// joueur qui a une décoration active au moment où l'organisateur la
// dépublie la verrait disparaître de son avatar sans raison. Seul le
// catalogue de CHOIX (renderDecorationsGrid, panel d'attribution) doit
// respecter includeUnpublished:false — l'affichage, lui, doit toujours
// pouvoir retrouver une décoration déjà attribuée/active.
export function findAnyDecoration(id) {
  return getAllDecorations({ includeUnpublished: true }).find((d) => d.id === id) || null;
}
export function findAnyTheme(id) {
  return getAllThemes().find((t) => t.id === id) || null;
}
export function findAnyTag(id) {
  return liveTags.find((t) => t.id === id) || null;
}

// Un tag est utilisable par un joueur soit parce qu'il l'a explicitement
// reçu ("owned"), soit parce que l'organisateur l'a marqué comme disponible
// pour tout le monde dès la création du compte ("defaultOwned").
export function isTagUsable(tagId, owned) {
  if ((owned || []).includes(tagId)) return true;
  const tag = findAnyTag(tagId);
  return !!tag?.defaultOwned;
}

// Tags que ce profil peut choisir d'afficher : les siens + les tags "par
// défaut" du catalogue (même si "owned" n'a pas encore été mis à jour pour
// ce compte, ex. un tag par défaut créé après l'inscription).
export function usableTagsFor(profile) {
  const owned = new Set(profile?.tags?.owned || []);
  return liveTags.filter((t) => t.defaultOwned || owned.has(t.id));
}

// ---------------------------------------------------------------------------
// Thème — gère aussi bien les 6 thèmes de base (via les classes CSS
// existantes body[data-theme=...]) que les thèmes personnalisés créés par
// l'organisateur (via des variables CSS injectées directement, propres à ce
// thème-là — aucune modification de style.css nécessaire pour en ajouter).
// ---------------------------------------------------------------------------
const CUSTOM_THEME_VARS = ["bg", "bg2", "panel", "panelBorder", "accent", "accent2", "text", "muted"];
const VAR_NAMES = {
  bg: "--bg",
  bg2: "--bg2",
  panel: "--panel",
  panelBorder: "--panel-border",
  accent: "--accent",
  accent2: "--accent2",
  text: "--text",
  muted: "--muted",
};

export function applyThemeLive(themeId) {
  const custom = liveThemes.find((t) => t.id === themeId);
  document.body.setAttribute("data-theme", custom ? `custom-${themeId}` : (findTheme(themeId) ? themeId : "classique"));

  // On efface toujours les variables injectées précédemment avant d'en
  // appliquer de nouvelles, pour ne jamais laisser un ancien thème
  // personnalisé "fuiter" sur un thème de base choisi juste après.
  CUSTOM_THEME_VARS.forEach((key) => document.body.style.removeProperty(VAR_NAMES[key]));
  if (custom?.colors) {
    CUSTOM_THEME_VARS.forEach((key) => {
      const val = custom.colors[key];
      if (val) document.body.style.setProperty(VAR_NAMES[key], val);
    });
    // accent-grad n'est pas modifiable individuellement : on en construit un
    // simple dégradé accent -> accent2 pour rester cohérent avec le reste de
    // l'appli (boutons, avatar par défaut...). Même chose pour le fond de la
    // page (radial-gradient codé en dur dans style.css pour les thèmes de
    // base) : on le remplace par un dégradé basé sur bg/bg2 du thème perso.
    if (custom.colors.accent && custom.colors.accent2) {
      document.body.style.setProperty(
        "--accent-grad",
        `linear-gradient(135deg, ${custom.colors.accent}, ${custom.colors.accent2})`
      );
    } else {
      document.body.style.removeProperty("--accent-grad");
    }
    if (custom.colors.bg) {
      document.body.style.background = `radial-gradient(circle at top, ${custom.colors.bg2 || custom.colors.bg} 0%, ${custom.colors.bg} 60%)`;
    }
  } else {
    document.body.style.removeProperty("--accent-grad");
    document.body.style.removeProperty("background");
  }

  // Image de fond personnalisée (facultative, en plus des couleurs) : on
  // efface toujours d'abord (même logique défensive que les variables CSS
  // ci-dessus) puis on la réapplique par-dessus le dégradé de couleurs si le
  // thème en a une.
  document.body.style.removeProperty("background-image");
  document.body.style.removeProperty("background-size");
  document.body.style.removeProperty("background-position");
  document.body.style.removeProperty("background-repeat");
  document.body.style.removeProperty("background-attachment");
  if (custom?.bgImageDataUrl) {
    document.body.style.backgroundImage = `url("${custom.bgImageDataUrl}")`;
    document.body.style.backgroundSize = "cover";
    document.body.style.backgroundPosition = "center";
    document.body.style.backgroundRepeat = "no-repeat";
    document.body.style.backgroundAttachment = "fixed";
  }
}

// ---------------------------------------------------------------------------
// Compression d'image — décorations statiques (canvas, perd l'animation
// mais garde la transparence en PNG) vs animées (fichier gardé tel quel,
// juste plafonné en taille, car un GIF ne peut pas être recompressé côté
// client sans bibliothèque externe).
// ---------------------------------------------------------------------------
function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export async function compressStaticDecoImage(file) {
  const img = await fileToImage(file);
  let side = 480;
  let dataUrl = "";
  do {
    const canvas = document.createElement("canvas");
    const ratio = Math.min(1, side / Math.max(img.width, img.height));
    canvas.width = Math.round(img.width * ratio);
    canvas.height = Math.round(img.height * ratio);
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    dataUrl = canvas.toDataURL("image/png");
    side -= 80;
  } while (dataUrl.length > MAX_STATIC_DECO_BYTES && side > 80);
  return dataUrl;
}

// Compression d'une image de fond de thème (JPEG, pas de transparence
// nécessaire ici) : on réduit la plus grande dimension par paliers jusqu'à
// passer sous MAX_THEME_BG_BYTES.
export async function compressThemeBgImage(file) {
  const img = await fileToImage(file);
  let side = 1600;
  let dataUrl = "";
  do {
    const canvas = document.createElement("canvas");
    const ratio = Math.min(1, side / Math.max(img.width, img.height));
    canvas.width = Math.round(img.width * ratio);
    canvas.height = Math.round(img.height * ratio);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    dataUrl = canvas.toDataURL("image/jpeg", 0.82);
    side -= 150;
  } while (dataUrl.length > MAX_THEME_BG_BYTES && side > 150);
  return dataUrl;
}

export function fileToRawDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------------------------------------------------------------------------
// Gabarits téléchargeables — pour préparer une image de décoration ou de
// fond de thème dans un logiciel externe (Photoshop, GIMP, Canva...) avec
// les bonnes proportions dès le départ, puis l'importer directement.
// ---------------------------------------------------------------------------
function triggerDownload(dataUrl, filename) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// La décoration s'affiche à 136% de la taille de l'avatar (voir
// .avatar-deco-overlay dans style.css : inset -18%, width/height 136%), donc
// la photo de profil occupe le carré central de 100/136 ≈ 73,53% de l'image
// de décoration. Le gabarit dessine ce carré en pointillés pour que
// l'organisateur sache exactement où positionner/laisser transparent
// l'emplacement de la photo.
export function downloadDecorationTemplate() {
  const SIZE = 1024;
  const PHOTO_RATIO = 100 / 136;
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");

  // Fond transparent avec damier léger pour bien visualiser la zone
  // transparente une fois exporté en PNG (le damier n'est qu'un repère
  // visuel dans le gabarit, pas dans l'image finale).
  const cell = 32;
  for (let y = 0; y < SIZE; y += cell) {
    for (let x = 0; x < SIZE; x += cell) {
      ctx.fillStyle = (x / cell + y / cell) % 2 === 0 ? "#f0f0f0" : "#ffffff";
      ctx.fillRect(x, y, cell, cell);
    }
  }

  const photoSize = Math.round(SIZE * PHOTO_RATIO);
  const offset = Math.round((SIZE - photoSize) / 2);

  ctx.save();
  ctx.strokeStyle = "#ff2d55";
  ctx.lineWidth = 4;
  ctx.setLineDash([16, 12]);
  ctx.strokeRect(offset, offset, photoSize, photoSize);
  ctx.restore();

  ctx.fillStyle = "#ff2d55";
  ctx.font = "bold 26px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Photo de profil (zone cachée par la déco)", SIZE / 2, offset - 20);
  ctx.font = "20px sans-serif";
  ctx.fillText(`Image complète ${SIZE}×${SIZE} px — carré rouge = ${photoSize}×${photoSize} px`, SIZE / 2, SIZE - 16);

  triggerDownload(canvas.toDataURL("image/png"), "gabarit-decoration-1024x1024.png");
}

// Gabarit pour le fond d'un thème personnalisé : image plein écran, on
// marque une zone centrale "sûre" (contenu important pas caché derrière les
// panneaux de l'interface qui restent semi-transparents au centre) sans
// contrainte stricte comme pour la décoration.
export function downloadThemeBgTemplate() {
  const W = 1080;
  const H = 1920;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#14161c";
  ctx.fillRect(0, 0, W, H);

  const marginX = Math.round(W * 0.08);
  const marginY = Math.round(H * 0.12);
  ctx.save();
  ctx.strokeStyle = "#5b8cff";
  ctx.lineWidth = 4;
  ctx.setLineDash([18, 14]);
  ctx.strokeRect(marginX, marginY, W - marginX * 2, H - marginY * 2);
  ctx.restore();

  ctx.fillStyle = "#5b8cff";
  ctx.textAlign = "center";
  ctx.font = "bold 34px sans-serif";
  ctx.fillText("Zone centrale = souvent recouverte par l'interface", W / 2, marginY - 24);
  ctx.font = "26px sans-serif";
  ctx.fillText("Privilégier les détails/couleurs vives sur les bords", W / 2, H - marginY + 46);
  ctx.font = "22px sans-serif";
  ctx.fillText(`Format conseillé : ${W}×${H} px (portrait)`, W / 2, H / 2);

  triggerDownload(canvas.toDataURL("image/png"), "gabarit-fond-theme-1080x1920.png");
}

// ---------------------------------------------------------------------------
// Actions organisateur — création / modification de décorations, thèmes,
// tags. Les règles Firestore revérifient le rôle ; ces fonctions ne servent
// qu'à préparer et envoyer l'écriture.
// ---------------------------------------------------------------------------
export async function createDecoration({ name, type, imageDataUrl }) {
  await addDoc(decorationsCol, {
    name: name.trim(),
    type,
    imageDataUrl,
    // Non publiée par défaut : seul l'organisateur la voit (dans l'Espace
    // organisateur), le temps de la préparer tranquillement. Voir le bouton
    // "Publier" / "Dépublier" dans settings.js (renderDecoManageList).
    published: false,
    createdAt: serverTimestamp(),
  });
}
export async function updateDecoration(id, patch) {
  await updateDoc(doc(decorationsCol, id), patch);
}
export async function deleteDecoration(id) {
  await deleteDoc(doc(decorationsCol, id));
}

export async function createTheme({ name, colors, bgImageDataUrl }) {
  await addDoc(themesCol, {
    name: name.trim(),
    colors,
    ...(bgImageDataUrl ? { bgImageDataUrl } : {}),
    createdAt: serverTimestamp(),
  });
}
export async function updateTheme(id, patch) {
  await updateDoc(doc(themesCol, id), patch);
}
export async function deleteTheme(id) {
  await deleteDoc(doc(themesCol, id));
}

// emoji est facultatif (ex. "🏅") — affiché juste avant le nom du tag
// partout où il apparaît (grilles de sélection, pastilles sur un profil...).
export async function createTag({ name, color, defaultOwned, emoji }) {
  await addDoc(tagsCol, {
    name: name.trim(),
    color,
    defaultOwned: !!defaultOwned,
    emoji: (emoji || "").trim() || null,
    createdAt: serverTimestamp(),
  });
}
export async function updateTag(id, patch) {
  await updateDoc(doc(tagsCol, id), patch);
}
export async function deleteTag(id) {
  await deleteDoc(doc(tagsCol, id));
}

// Jeux (TCG) : pas de modification du nom une fois créé (comme les autres
// catalogues), juste ajout — un nom en double (même en base) est bloqué
// côté appel pour éviter deux entrées identiques dans les menus déroulants.
// L'id du document est le nom exact du jeu (au lieu d'un id aléatoire) : ça
// permet à un jeu de base (Pokémon, Lorcana...), qui n'a jamais eu de
// document Firestore avant, de recevoir lui aussi un document au même
// endroit — uniquement pour porter sa condition de victoire (voir
// setGameWinCondition) — sans jamais créer de doublon dans les menus.
export async function createGame(name) {
  await setDoc(doc(gamesCol, name.trim()), { name: name.trim(), createdAt: serverTimestamp() });
}

// Couleur de texte lisible (noir ou blanc) selon la luminosité perçue de la
// couleur de fond du tag — évite du texte illisible si l'organisateur choisit
// une couleur claire.
export function contrastTextColor(hex) {
  const h = (hex || "#888888").replace("#", "");
  if (h.length !== 6) return "#ffffff";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#14161c" : "#ffffff";
}
