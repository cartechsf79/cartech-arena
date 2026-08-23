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
  updateDoc,
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
export function getAllDecorations() {
  const builtins = DECORATIONS.map((d) => ({ ...d, builtin: true, type: "static" }));
  const custom = liveDecorations.map((d) => ({ ...d, builtin: false }));
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
export function getAllGames() {
  return [...GAMES, ...liveGames.map((g) => g.name)];
}

export function findAnyDecoration(id) {
  return getAllDecorations().find((d) => d.id === id) || null;
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

export function fileToRawDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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
    createdAt: serverTimestamp(),
  });
}
export async function updateDecoration(id, patch) {
  await updateDoc(doc(decorationsCol, id), patch);
}

export async function createTheme({ name, colors }) {
  await addDoc(themesCol, {
    name: name.trim(),
    colors,
    createdAt: serverTimestamp(),
  });
}
export async function updateTheme(id, patch) {
  await updateDoc(doc(themesCol, id), patch);
}

export async function createTag({ name, color, defaultOwned }) {
  await addDoc(tagsCol, {
    name: name.trim(),
    color,
    defaultOwned: !!defaultOwned,
    createdAt: serverTimestamp(),
  });
}
export async function updateTag(id, patch) {
  await updateDoc(doc(tagsCol, id), patch);
}

// Jeux (TCG) : pas de modification une fois créés (comme les autres
// catalogues), juste ajout — un nom en double (même en base) est bloqué
// côté appel pour éviter deux entrées identiques dans les menus déroulants.
export async function createGame(name) {
  await addDoc(gamesCol, { name: name.trim(), createdAt: serverTimestamp() });
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
