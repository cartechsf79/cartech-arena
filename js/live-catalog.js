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
  arrayUnion,
  arrayRemove,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import { db } from "./firebase-init.js";
import { DECORATIONS, THEMES, findTheme, GAMES } from "./catalog.js";

const decorationsCol = collection(db, "decorations");
const themesCol = collection(db, "themes");
const tagsCol = collection(db, "tags");
const gamesCol = collection(db, "games");
const profileBgsCol = collection(db, "profileBgs");
const titlesCol = collection(db, "titles");

let liveDecorations = [];
let liveThemes = [];
let liveTags = [];
let liveGames = [];
let liveProfileBgs = [];
let liveTitles = [];
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
// Emoji personnalisé d'un tag : une toute petite icône (affichée à ~16px),
// donc une marge bien plus stricte que les décorations suffit largement.
export const MAX_TAG_EMOJI_BYTES = 150_000;
// Emoji personnalisé animé (gif) : gardé tel quel, comme les décorations
// animées, car un recadrage/une recompression via canvas ferait perdre
// l'animation (une seule image serait "gelée"). Toujours plafonné plus bas
// que les décorations animées puisque l'icône reste minuscule à l'affichage.
export const MAX_ANIMATED_TAG_EMOJI_BYTES = 300_000;
// Fond de profil : affiché en arrière-plan (estompé) derrière une fiche
// profil entière (plus grand qu'une icône mais plus petit qu'un fond de
// thème plein écran) — marge intermédiaire entre les deux.
export const MAX_PROFILE_BG_BYTES = 500_000;
// Icône d'un élément de jeu (ex. les couleurs d'encre à Lorcana) : même
// gabarit qu'un emoji de tag (toute petite icône), donc même marge.
export const MAX_GAME_ELEMENT_BYTES = 150_000;

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
  listeners.push(
    onSnapshot(profileBgsCol, (snap) => {
      liveProfileBgs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      onUpdate?.();
      document.dispatchEvent(new CustomEvent("cartech:catalogs"));
    })
  );
  listeners.push(
    onSnapshot(titlesCol, (snap) => {
      liveTitles = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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
  liveProfileBgs = [];
  liveTitles = [];
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

// Fonds de profil : pas de "builtin" (aucun fond de base) — uniquement créés
// par l'organisateur, avec le même fonctionnement publié/non publié que les
// décorations (voir getAllDecorations ci-dessus).
export function getAllProfileBgs({ includeUnpublished = false } = {}) {
  return liveProfileBgs.filter((b) => includeUnpublished || b.published);
}
export function findAnyProfileBg(id) {
  return liveProfileBgs.find((b) => b.id === id) || null;
}

// Titres personnalisés (affichés sous le pseudo) : pas de "builtin" non plus
// (aucun titre de base), même fonctionnement publié/non publié que les
// fonds de profil et les décorations.
export function getAllTitles({ includeUnpublished = false } = {}) {
  return liveTitles.filter((t) => includeUnpublished || t.published);
}
export function findAnyTitle(id) {
  return liveTitles.find((t) => t.id === id) || null;
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

// ---------------------------------------------------------------------------
// Éléments d'un jeu (ex. les 6 couleurs d'encre à Lorcana, les types à
// Pokémon...) — configurés par jeu, stockés dans le même document
// "games/{nom}" que la condition de victoire ci-dessus (voir le long
// commentaire sur setGameWinCondition : { merge: true } est indispensable
// pour ne jamais écraser le reste du document, notamment sur un jeu de base
// qui n'a pas de champ "name"). Chaque élément a un nom + une petite icône,
// pour que les joueurs déclarent leur deck (voir daily-duel.js/event.js) en
// cochant un ou plusieurs éléments parmi ceux du jeu choisi — un deck peut
// combiner plusieurs éléments (ex. un deck 2 couleurs à Lorcana).
// arrayUnion/arrayRemove (plutôt qu'une lecture puis réécriture du tableau
// entier) évitent tout risque de race condition si deux ajouts partent
// presque en même temps.
// ---------------------------------------------------------------------------
export function getGameElements(name) {
  return liveGames.find((g) => g.id === name)?.elements || [];
}
export function findGameElement(gameName, elementId) {
  return getGameElements(gameName).find((e) => e.id === elementId) || null;
}
export async function addGameElement(gameName, { name, imageDataUrl }) {
  const element = { id: "el_" + Math.random().toString(36).slice(2, 10), name, imageDataUrl };
  await setDoc(doc(gamesCol, gameName), { elements: arrayUnion(element) }, { merge: true });
}
export async function removeGameElement(gameName, elementId) {
  const element = findGameElement(gameName, elementId);
  if (!element) return;
  await updateDoc(doc(gamesCol, gameName), { elements: arrayRemove(element) });
}

// ---------------------------------------------------------------------------
// Affichage partagé des éléments — utilisé aussi bien par le Duel du jour
// que par l'Événement (voir daily-duel.js/event.js), d'où leur place ici
// plutôt que dupliqués dans les deux fichiers.
// ---------------------------------------------------------------------------
function escapeHtmlElements(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

// Sélecteur à cocher (chips) des éléments d'un jeu, pour déclarer son deck.
// Retourne une chaîne vide si le jeu n'a aucun élément configuré (rien à
// déclarer) — c'est ce vide qui rend la déclaration facultative tant que
// l'organisateur n'a configuré aucun élément pour ce jeu.
export function elementsPickerHtml(gameName, selectedIds) {
  const elements = getGameElements(gameName);
  if (!elements.length) return "";
  return `
    <label>Ton deck — coche un ou plusieurs éléments</label>
    <div class="chip-grid game-elements-grid">
      ${elements
        .map(
          (el) => `
        <div class="chip${selectedIds.includes(el.id) ? " active" : ""}" data-element-id="${el.id}">
          <div class="chip-swatch" style="background-image:url('${el.imageDataUrl}');background-size:cover;background-position:center;"></div>
          <div class="chip-label">${escapeHtmlElements(el.name)}</div>
        </div>
      `
        )
        .join("")}
    </div>
  `;
}

// Branche les clics sur les chips générées par elementsPickerHtml — modifie
// directement le tableau passé en argument (par référence) et bascule la
// classe "active" sur le chip cliqué, sans avoir besoin de tout reconstruire.
export function wireElementsPicker(container, selectedIds) {
  if (!container) return;
  container.querySelectorAll(".chip[data-element-id]").forEach((chip) => {
    chip.addEventListener("click", () => {
      const id = chip.dataset.elementId;
      const idx = selectedIds.indexOf(id);
      if (idx >= 0) selectedIds.splice(idx, 1);
      else selectedIds.push(id);
      chip.classList.toggle("active");
    });
  });
}

// Affichage en lecture seule des éléments d'un deck déjà déclaré (une fois
// révélé — duel terminé ou événement terminé). elementIds peut être null
// (deck jamais déclaré, ou pas encore visible) ou vide.
export function elementIconsHtml(gameName, elementIds) {
  if (!elementIds || !elementIds.length) {
    return `<span class="settings-note">Deck non précisé.</span>`;
  }
  return elementIds
    .map((id) => {
      const el = findGameElement(gameName, id);
      if (!el) return "";
      return `<span class="game-element-chip"><img src="${el.imageDataUrl}" alt="${escapeHtmlElements(el.name)}">${escapeHtmlElements(el.name)}</span>`;
    })
    .join(" ");
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

// Le tag de récompense du système de parrainage — au plus un à la fois, créé/
// marqué par l'organisateur (case à cocher dans settings.js). Retourne null
// tant que l'organisateur n'en a pas encore marqué un : dans ce cas, aucune
// récompense n'est distribuée (voir maybeGrantReferralReward dans
// daily-duel.js), comme pour tout catalogue pas encore configuré par
// l'organisateur dans cette appli.
export function findReferralRewardTag() {
  return liveTags.find((t) => t.referralReward) || null;
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
// ce compte, ex. un tag par défaut créé après l'inscription). L'organisateur
// a tout de débloqué d'office sur son propre compte, pour pouvoir tester
// n'importe quel tag sans avoir à se l'attribuer lui-même.
export function usableTagsFor(profile) {
  if (profile?.role === "organisateur") return liveTags;
  const owned = new Set(profile?.tags?.owned || []);
  return liveTags.filter((t) => t.defaultOwned || owned.has(t.id));
}

// Icône d'un tag à afficher : l'image personnalisée est prioritaire si elle
// existe, sinon l'emoji texte, sinon rien. Retourne un objet générique
// (plutôt que du HTML déjà construit) pour rester réutilisable tel quel dans
// n'importe quel fichier d'affichage (settings.js, app.js...) sans dépendre
// d'une fonction d'échappement HTML particulière.
export function getTagIcon(tag) {
  if (tag?.emojiImageDataUrl) return { type: "image", value: tag.emojiImageDataUrl };
  if (tag?.emoji) return { type: "emoji", value: tag.emoji };
  return { type: "none", value: null };
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

// Compression d'un emoji personnalisé (image) : recadrée automatiquement au
// centre en carré (l'icône s'affiche toujours petite et ronde, ~16px), puis
// réduite par paliers jusqu'à passer sous MAX_TAG_EMOJI_BYTES. PNG pour
// garder la transparence (ex. un logo sur fond transparent).
export async function compressTagEmojiImage(file) {
  const img = await fileToImage(file);
  const srcSize = Math.min(img.width, img.height);
  const srcX = Math.round((img.width - srcSize) / 2);
  const srcY = Math.round((img.height - srcSize) / 2);
  let side = 160;
  let dataUrl = "";
  do {
    const canvas = document.createElement("canvas");
    canvas.width = side;
    canvas.height = side;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, side, side);
    ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, side, side);
    dataUrl = canvas.toDataURL("image/png");
    side -= 20;
  } while (dataUrl.length > MAX_TAG_EMOJI_BYTES && side > 20);
  return dataUrl;
}

// Compression de l'icône d'un élément de jeu (ex. une couleur d'encre à
// Lorcana, un type à Pokémon...) — même logique que l'emoji de tag
// ci-dessus (recadrée en carré au centre, toute petite icône).
export async function compressGameElementImage(file) {
  const img = await fileToImage(file);
  const srcSize = Math.min(img.width, img.height);
  const srcX = Math.round((img.width - srcSize) / 2);
  const srcY = Math.round((img.height - srcSize) / 2);
  let side = 160;
  let dataUrl = "";
  do {
    const canvas = document.createElement("canvas");
    canvas.width = side;
    canvas.height = side;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, side, side);
    ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, side, side);
    dataUrl = canvas.toDataURL("image/png");
    side -= 20;
  } while (dataUrl.length > MAX_GAME_ELEMENT_BYTES && side > 20);
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

// Compression d'une image de fond de profil (JPEG, même logique que le fond
// de thème ci-dessus mais taille de départ plus modeste : affichée derrière
// une simple fiche profil, pas en plein écran).
export async function compressProfileBgImage(file) {
  const img = await fileToImage(file);
  let side = 1200;
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
    side -= 120;
  } while (dataUrl.length > MAX_PROFILE_BG_BYTES && side > 120);
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

// Gabarit pour un fond de profil : image affichée en format "carte" (plus
// large que haute) derrière une fiche profil, estompée (opacité réduite,
// voir .profile-bg-card dans style.css) — la zone marquée reste visible en
// entier, contrairement au fond de thème plein écran qui peut être recadré
// par le navigateur selon la taille d'écran.
// Le fond de profil s'affiche derrière des zones plutôt HAUTES (toute la
// fiche d'accueil, toute la popup "Voir le profil") plutôt que larges — le
// gabarit est donc en format portrait (plus haut que large), pas paysage.
// La forme exacte de la zone visible varie légèrement selon l'endroit
// (accueil, popup, recherche organisateur), donc le rectangle en pointillé
// n'est qu'un repère : garde surtout l'essentiel de l'image bien centré,
// avec de la marge tout autour, pour que ça reste bon partout.
export function downloadProfileBgTemplate() {
  const W = 900;
  const H = 1200;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#14161c";
  ctx.fillRect(0, 0, W, H);

  // Bande de titre en haut, assez haute pour un texte sur plusieurs lignes,
  // puis le repère (rectangle en pointillé) sur le reste de l'image.
  const headerH = Math.round(H * 0.16);
  const marginX = Math.round(W * 0.08);
  const marginBottom = Math.round(H * 0.05);
  ctx.save();
  ctx.strokeStyle = "#5b8cff";
  ctx.lineWidth = 4;
  ctx.setLineDash([18, 14]);
  ctx.strokeRect(marginX, headerH, W - marginX * 2, H - headerH - marginBottom);
  ctx.restore();

  ctx.fillStyle = "#5b8cff";
  ctx.textAlign = "center";
  ctx.font = "bold 26px sans-serif";
  wrapFillText(
    ctx,
    "Garde l'essentiel de l'image bien centré : la zone visible varie un peu selon l'écran (accueil, popup, recherche)",
    W / 2,
    38,
    W - marginX * 2,
    32
  );
  ctx.font = "22px sans-serif";
  ctx.fillText(`Format conseillé : ${W}×${H} px (portrait)`, W / 2, H / 2);

  triggerDownload(canvas.toDataURL("image/png"), "gabarit-fond-profil-900x1200.png");
}

// Petit utilitaire pour retourner du texte sur plusieurs lignes dans un
// canvas (fillText ne le fait pas nativement) — mot par mot, aligné en haut.
function wrapFillText(ctx, text, x, startY, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  const lines = [];
  words.forEach((word) => {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  });
  if (line) lines.push(line);
  lines.forEach((l, i) => ctx.fillText(l, x, startY + i * lineHeight));
}

// Gabarit pour un emoji personnalisé de tag : l'icône est toujours recadrée
// en carré au centre puis affichée en rond à très petite taille (~16px), donc
// le gabarit marque un large cercle de sécurité au centre — tout ce qui sort
// de ce cercle (les coins de l'image) sera invisible à l'affichage.
export function downloadTagEmojiTemplate() {
  const SIZE = 512;
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");

  const cell = 16;
  for (let y = 0; y < SIZE; y += cell) {
    for (let x = 0; x < SIZE; x += cell) {
      ctx.fillStyle = (x / cell + y / cell) % 2 === 0 ? "#f0f0f0" : "#ffffff";
      ctx.fillRect(x, y, cell, cell);
    }
  }

  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const radius = SIZE / 2 - 8;

  ctx.save();
  ctx.strokeStyle = "#ff2d55";
  ctx.lineWidth = 4;
  ctx.setLineDash([14, 10]);
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = "#ff2d55";
  ctx.textAlign = "center";
  ctx.font = "bold 22px sans-serif";
  ctx.fillText("Zone visible = cercle (icône affichée toute petite et ronde)", cx, 34);
  ctx.font = "18px sans-serif";
  ctx.fillText(`Image carrée ${SIZE}×${SIZE} px, fond transparent conseillé (gif animé aussi accepté)`, cx, SIZE - 20);

  triggerDownload(canvas.toDataURL("image/png"), "gabarit-emoji-tag-512x512.png");
}

// Gabarit pour l'icône d'un élément de jeu — même principe que le gabarit
// d'emoji de tag ci-dessus (zone visible = cercle).
export function downloadGameElementTemplate() {
  const SIZE = 512;
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");

  const cell = 16;
  for (let y = 0; y < SIZE; y += cell) {
    for (let x = 0; x < SIZE; x += cell) {
      ctx.fillStyle = (x / cell + y / cell) % 2 === 0 ? "#f0f0f0" : "#ffffff";
      ctx.fillRect(x, y, cell, cell);
    }
  }

  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const radius = SIZE / 2 - 8;

  ctx.save();
  ctx.strokeStyle = "#5b8cff";
  ctx.lineWidth = 4;
  ctx.setLineDash([14, 10]);
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = "#5b8cff";
  ctx.textAlign = "center";
  ctx.font = "bold 22px sans-serif";
  ctx.fillText("Zone visible = cercle (icône affichée toute petite et ronde)", cx, 34);
  ctx.font = "18px sans-serif";
  ctx.fillText(`Image carrée ${SIZE}×${SIZE} px, fond transparent conseillé`, cx, SIZE - 20);

  triggerDownload(canvas.toDataURL("image/png"), "gabarit-element-jeu-512x512.png");
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

export async function createProfileBg({ name, imageDataUrl }) {
  await addDoc(profileBgsCol, {
    name: name.trim(),
    imageDataUrl,
    // Même logique que les décorations : non publié par défaut, à publier
    // explicitement une fois prêt (voir renderProfileBgManageList).
    published: false,
    createdAt: serverTimestamp(),
  });
}
export async function updateProfileBg(id, patch) {
  await updateDoc(doc(profileBgsCol, id), patch);
}
export async function deleteProfileBg(id) {
  await deleteDoc(doc(profileBgsCol, id));
}

// Titre personnalisé (affiché sous le pseudo, ex. "Champion de la saison
// 2") : juste un nom, pas d'image — même logique publié/non publié que les
// fonds de profil ci-dessus.
export async function createTitle({ name }) {
  await addDoc(titlesCol, {
    name: name.trim(),
    published: false,
    createdAt: serverTimestamp(),
  });
}
export async function updateTitle(id, patch) {
  await updateDoc(doc(titlesCol, id), patch);
}
export async function deleteTitle(id) {
  await deleteDoc(doc(titlesCol, id));
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
// emojiImageDataUrl est un emoji personnalisé importé par image (facultatif
// lui aussi) : s'il est défini, il prend le pas sur l'emoji texte à
// l'affichage (voir getTagIcon ci-dessus) sans jamais l'effacer — repasser
// emojiImageDataUrl à null (via updateTag) suffit à revenir à l'emoji texte.
// referralReward (facultatif) : marque CE tag comme la récompense du
// système de parrainage (voir js/app.js pour la modale d'inscription et
// js/daily-duel.js pour le moment où il est accordé) — voir aussi
// tagIsReferralReward dans firestore.rules, qui s'appuie sur ce même champ
// pour valider côté serveur les 2 écritures (soi-même + le parrain).
export async function createTag({ name, color, defaultOwned, emoji, emojiImageDataUrl, referralReward }) {
  await addDoc(tagsCol, {
    name: name.trim(),
    color,
    defaultOwned: !!defaultOwned,
    referralReward: !!referralReward,
    emoji: (emoji || "").trim() || null,
    emojiImageDataUrl: emojiImageDataUrl || null,
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
