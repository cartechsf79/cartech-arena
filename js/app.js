// ============================================================================
// Car'Tech Arena — logique de compte (inscription / connexion / rôles)
// ============================================================================
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  limit,
  getDocs,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import { auth, db, ORGANIZER_EMAIL } from "./firebase-init.js";
import { DEFAULT_OWNED_THEMES } from "./catalog.js";
import { startLiveCatalogs, stopLiveCatalogs, findAnyDecoration, findAnyTag, findAnyProfileBg, findAnyTitle, applyThemeLive, contrastTextColor, getTagIcon } from "./live-catalog.js";
import { startHomePlayersListener, stopHomePlayersListener } from "./home-players.js";
import { startSeasonBannerListener, stopSeasonBannerListener, startCareerStatsListener, stopCareerStatsListener, fetchCareerStats, fetchHeadToHead } from "./season.js";

export const $ = (sel) => document.querySelector(sel);

let currentProfile = null; // { pseudo, email, role, points, wins, losses, photoDataUrl, decorations, theme }
let currentUid = null;

export function getCurrentProfile() {
  return currentProfile;
}
export function getCurrentUid() {
  return currentUid;
}

function broadcastProfile() {
  document.dispatchEvent(
    new CustomEvent("cartech:profile", { detail: { uid: currentUid, profile: currentProfile } })
  );
}

// ---------------------------------------------------------------------------
// Messages d'erreur Firebase traduits en français
// ---------------------------------------------------------------------------
const ERROR_MESSAGES = {
  "auth/email-already-in-use": "Un compte existe déjà avec cet email.",
  "auth/invalid-email": "Cette adresse email n'est pas valide.",
  "auth/weak-password": "Le mot de passe doit contenir au moins 6 caractères.",
  "auth/user-not-found": "Aucun compte ne correspond à cet email.",
  "auth/wrong-password": "Mot de passe incorrect.",
  "auth/invalid-credential": "Email ou mot de passe incorrect.",
  "auth/too-many-requests": "Trop de tentatives. Réessaie dans quelques minutes.",
  "auth/popup-closed-by-user": "Connexion Google annulée.",
  "auth/unauthorized-domain": "Ce site n'est pas encore autorisé pour Google (à ajouter dans Firebase > Authentication > Paramètres > Domaines autorisés).",
  "auth/network-request-failed": "Problème de connexion réseau. Réessaie.",
  "auth/requires-recent-login": "Pour ta sécurité, reconnecte-toi puis réessaie cette action.",
  "permission-denied": "Action refusée (droits insuffisants). Si ça te semble anormal, préviens l'organisateur.",
};

export function friendlyError(err) {
  return ERROR_MESSAGES[err?.code] || "Une erreur est survenue. Réessaie.";
}

export function showToast(msg, isError = false) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.toggle("toast-error", isError);
  t.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove("show"), 3200);
}

function setLoading(button, loading) {
  if (!button) return;
  button.disabled = loading;
  button.dataset.label = button.dataset.label || button.textContent;
  button.textContent = loading ? "Un instant…" : button.dataset.label;
}

// ---------------------------------------------------------------------------
// Création / récupération du profil Firestore lié au compte
// ---------------------------------------------------------------------------
// Le pseudo choisi à l'inscription est mémorisé ici pendant la création du
// compte : selon la rapidité de la connexion, onAuthStateChanged (plus bas)
// peut se déclencher et créer le profil Firestore AVANT que handleSignup()
// n'ait eu le temps de lui transmettre le pseudo directement — sans ce
// filet, le profil se retrouverait créé avec l'email en guise de pseudo.
let pendingSignupPseudo = null;

// Vrai pendant qu'une inscription (email ou bouton Google du panneau
// "Créer un compte") est en cours dans cet onglet — utilisé juste après par
// onAuthStateChanged pour savoir s'il doit proposer la modale « As-tu été
// parrainé ? » avant d'afficher l'écran principal. Même filet de sécurité
// que pendingSignupPseudo ci-dessus : comme ensureUserProfile peut être
// appelée en concurrence par handleSignup/handleGoogle ET par
// onAuthStateChanged, on ne peut pas se fier à l'ordre d'arrivée pour savoir
// "qui" a réellement créé le document.
let pendingReferralPrompt = false;

// Retourne { profile, isNew } : isNew vrai seulement quand CET appel vient
// de créer le document (utilisé par onAuthStateChanged en secours de
// pendingReferralPrompt ci-dessus, au cas où l'appel concurrent d'un des
// deux flux d'inscription aurait gagné la course et créé le document avant
// que ce module ait eu la main).
async function ensureUserProfile(user, pseudoFromSignup) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    const data = snap.data();
    // Auto-réparation : complète les champs manquants pour les comptes créés
    // avant l'ajout des paramètres (photo, décorations, thème…), sans jamais
    // toucher au rôle, aux points ni aux listes déjà débloquées.
    const patch = {};
    if (!data.decorations) patch.decorations = { owned: [], active: null };
    if (!data.theme) patch.theme = { owned: DEFAULT_OWNED_THEMES, active: "classique" };
    if (!data.profileBg) patch.profileBg = { owned: [], active: null };
    if (!data.title) patch.title = { owned: [], active: null };
    // Un compte dont "tags" existe déjà mais sans "owned" (ex. un joueur qui
    // a activé un tag "par défaut" avant même que "tags" ait été créé sur
    // son document) bloquait TOUTES ses modifications futures — voir
    // firestore.rules. On répare ici en ajoutant "owned: []" tout en
    // gardant ses tags déjà affichés ("active") intacts.
    if (!data.tags || !Array.isArray(data.tags.owned)) {
      patch.tags = { owned: [], active: Array.isArray(data.tags?.active) ? data.tags.active : [] };
    }
    // Parrainage : comptes créés avant cette version, jamais parrainés ni
    // récompensés (voir js/firestore.rules pour la validation serveur).
    if (!data.referral) patch.referral = { referredByUid: null, rewardGranted: false };
    if (!("photoDataUrl" in data)) patch.photoDataUrl = null;
    if (!data.pseudoLower) patch.pseudoLower = (data.pseudo || "").toLowerCase();
    if (Object.keys(patch).length) {
      await setDoc(ref, patch, { merge: true });
      return { profile: { ...data, ...patch }, isNew: false };
    }
    return { profile: data, isNew: false };
  }

  const isOrganizer = (user.email || "").toLowerCase() === ORGANIZER_EMAIL.toLowerCase();
  const pseudo = pseudoFromSignup || pendingSignupPseudo || user.displayName || (user.email || "").split("@")[0];

  const profile = {
    pseudo,
    pseudoLower: pseudo.toLowerCase(),
    email: user.email,
    role: isOrganizer ? "organisateur" : "joueur",
    points: 0,
    wins: 0,
    losses: 0,
    photoDataUrl: null,
    decorations: { owned: [], active: null },
    theme: { owned: DEFAULT_OWNED_THEMES, active: "classique" },
    tags: { owned: [], active: [] },
    profileBg: { owned: [], active: null },
    title: { owned: [], active: null },
    referral: { referredByUid: null, rewardGranted: false },
    createdAt: serverTimestamp(),
  };

  await setDoc(ref, profile);
  return { profile, isNew: true };
}

// ---------------------------------------------------------------------------
// Actions : inscription / connexion / google / déconnexion
// ---------------------------------------------------------------------------
async function handleSignup(e) {
  e.preventDefault();
  const pseudo = $("#signup-pseudo").value.trim();
  const email = $("#signup-email").value.trim();
  const password = $("#signup-password").value;
  const btn = $("#signup-submit");

  if (!pseudo) {
    showToast("Choisis un pseudo 🙂", true);
    return;
  }

  setLoading(btn, true);
  pendingSignupPseudo = pseudo;
  pendingReferralPrompt = true;
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: pseudo });
    await ensureUserProfile(cred.user, pseudo);
    showToast(`Bienvenue sur Car'Tech Arena, ${pseudo} !`);
  } catch (err) {
    pendingReferralPrompt = false;
    showToast(friendlyError(err), true);
  } finally {
    pendingSignupPseudo = null;
    setLoading(btn, false);
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const email = $("#login-email").value.trim();
  const password = $("#login-password").value;
  const btn = $("#login-submit");

  setLoading(btn, true);
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    showToast(friendlyError(err), true);
  } finally {
    setLoading(btn, false);
  }
}

// signupIntent : vrai si on vient du bouton Google du panneau "Créer un
// compte" (par opposition à celui du panneau "Connexion") — sert uniquement
// à décider si onAuthStateChanged doit proposer la modale de parrainage (un
// compte Google déjà existant qui se reconnecte ne doit jamais la revoir).
async function handleGoogle(signupIntent) {
  if (signupIntent) pendingReferralPrompt = true;
  try {
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(auth, provider);
    await ensureUserProfile(cred.user);
  } catch (err) {
    pendingReferralPrompt = false;
    showToast(friendlyError(err), true);
  }
}

async function handleLogout() {
  await signOut(auth);
  showToast("À bientôt !");
}

// ---------------------------------------------------------------------------
// Affichage : bascule entre écran de connexion et appli, selon l'état auth
// ---------------------------------------------------------------------------
export function renderAvatar(container, profile, size = 54) {
  container.innerHTML = "";
  container.style.width = size + "px";
  container.style.height = size + "px";
  container.className = "avatar-shell";

  const inner = document.createElement("div");
  inner.className = "avatar-inner";
  if (profile?.photoDataUrl) {
    inner.style.backgroundImage = `url("${profile.photoDataUrl}")`;
    inner.style.backgroundSize = "cover";
    inner.style.backgroundPosition = "center";
  } else {
    inner.textContent = "🙂";
  }
  container.appendChild(inner);

  const decoId = profile?.decorations?.active;
  const deco = decoId ? findAnyDecoration(decoId) : null;
  if (deco?.builtin) {
    // Décoration "de base" : simple anneau en CSS (voir style.css).
    container.classList.add("has-deco", deco.css);
  } else if (deco?.imageDataUrl) {
    // Décoration créée par l'organisateur (statique ou animée) : une image
    // (ou un gif) superposée par-dessus la photo, en cadre décoratif —
    // l'animation d'un gif fonctionne nativement dans une balise <img>.
    container.classList.add("has-deco", "has-deco-custom");
    const overlay = document.createElement("img");
    overlay.className = "avatar-deco-overlay";
    overlay.src = deco.imageDataUrl;
    overlay.alt = "";
    container.appendChild(overlay);
  }
}

// Fond de profil (facultatif, débloqué par l'organisateur comme une
// décoration/un thème) : affiché en arrière-plan, légèrement estompé (voir
// .profile-bg-card dans style.css), derrière TOUTE la zone du profil (pas
// juste une petite carte à l'intérieur) — réutilisé sur l'accueil (sa propre
// fiche, tout le #profile-card), la popup "Voir le profil" (toute la
// fenêtre : titre, carte et bouton "Gérer ce joueur" compris) et la fiche de
// recherche organisateur (carte + tags), pour que ça reste cohérent partout
// où le profil d'un joueur est affiché (même logique que renderAvatar
// ci-dessus).
export function applyProfileBackground(el, profile) {
  if (!el) return;
  el.classList.add("profile-bg-card");
  const bgId = profile?.profileBg?.active || null;
  const bg = bgId ? findAnyProfileBg(bgId) : null;
  if (bg?.imageDataUrl) {
    el.style.setProperty("--profile-bg-image", `url("${bg.imageDataUrl}")`);
    el.classList.add("has-profile-bg");
  } else {
    el.style.removeProperty("--profile-bg-image");
    el.classList.remove("has-profile-bg");
  }
}

// Titre personnalisé actif (facultatif, débloqué par l'organisateur comme
// une décoration/un fond de profil) : une petite ligne de texte affichée
// juste sous le pseudo, partout où un pseudo apparaît (fiche d'accueil,
// popup "Voir le profil", recherche organisateur). Retourne une chaîne
// vide si aucun titre actif — l'élément appelant reste alors simplement
// vide (pas d'espace réservé inutile).
export function titleBadgeHtml(profile) {
  const titleId = profile?.title?.active || null;
  const title = titleId ? findAnyTitle(titleId) : null;
  if (!title) return "";
  return `<span class="profile-title-badge">🎖️ ${escapeHtmlLocal(title.name)}</span>`;
}

export function renderProfile(profile) {
  currentProfile = profile;
  broadcastProfile();

  $("#profile-pseudo").textContent = profile.pseudo;
  const titleEl = $("#profile-title");
  if (titleEl) titleEl.innerHTML = titleBadgeHtml(profile);
  $("#profile-email").textContent = profile.email;
  renderAvatar($("#profile-avatar"), profile, 54);
  applyProfileBackground($("#profile-card"), profile);

  const badge = $("#role-badge");
  const isOrganizer = profile.role === "organisateur";
  badge.textContent = isOrganizer ? "🛡️ Organisateur" : "🎮 Joueur";
  badge.classList.toggle("badge-organizer", isOrganizer);
  badge.classList.toggle("badge-player", !isOrganizer);

  // Points/victoires/défaites (à vie) + points de la saison en cours ne
  // viennent PAS de profile.points/wins/losses (des champs figés à 0 depuis
  // la création du compte, jamais mis à jour — voir app.js plus haut) mais
  // sont recalculés en direct depuis l'historique des duels par
  // startCareerStatsListener() (season.js), déjà démarré à la connexion.

  document.querySelectorAll(".organizer-only").forEach((el) => {
    el.style.display = isOrganizer ? "" : "none";
  });

  applyThemeLive(profile?.theme?.active || "classique");
}

// Utilisé par tous les écrans (Paramètres, Duel du jour, Événement…) pour
// basculer proprement d'une vue à l'autre sans avoir à lister chaque nouvel
// écran dans tous les autres fichiers à chaque ajout de fonctionnalité.
export function hideAllViews() {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
}

function showAuthScreen() {
  hideAllViews();
  $("#view-auth").classList.add("active");
  applyThemeLive("classique");
}

function showAppScreen() {
  hideAllViews();
  $("#view-app").classList.add("active");
}

// ---------------------------------------------------------------------------
// Fiche profil d'un joueur — petite fenêtre directement sur la page en
// cours (pas de navigation vers un autre écran), utilisée partout où un
// bouton "Voir le profil" apparaît (liste des joueurs de l'accueil, Duel du
// jour...). Lecture seule ; la gestion complète (attribuer décorations,
// thèmes, tags) reste réservée à l'écran Paramètres, accessible uniquement à
// l'organisateur via le lien "Gérer ce joueur".
// ---------------------------------------------------------------------------
function escapeHtmlLocal(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

// Victoires en vert, défaites en rouge (voir .stat-win/.stat-loss dans
// style.css) — exporté pour être réutilisé partout où un total victoires/
// défaites est affiché (cette popup, la fiche de recherche organisateur...),
// pour rester cohérent dans toute l'appli.
export function winsLossesHtml(wins, losses) {
  return `<span class="stat-win">${wins}V</span> / <span class="stat-loss">${losses}D</span>`;
}

export async function openPlayerProfileModal(targetUid) {
  const overlay = $("#overlay-player-profile");
  const body = $("#player-profile-modal-body");
  if (!overlay || !body) return;
  body.innerHTML = `<p class="settings-note">Chargement…</p>`;
  overlay.classList.add("show");
  try {
    const myUid = getCurrentUid();
    const [snap, career, headToHead] = await Promise.all([
      getDoc(doc(db, "users", targetUid)),
      fetchCareerStats(targetUid),
      // Pas de face-à-face avec soi-même (on ne consulte normalement jamais
      // son propre profil via cette popup, mais on se protège quand même).
      myUid && myUid !== targetUid ? fetchHeadToHead(myUid, targetUid) : Promise.resolve(null),
    ]);
    if (!snap.exists()) {
      body.innerHTML = `<p class="settings-note">Profil introuvable (peut-être supprimé).</p>`;
      return;
    }
    renderPlayerProfileModalContent(targetUid, snap.data(), career, headToHead);
  } catch (err) {
    body.innerHTML = `<p class="dd-error">${friendlyError(err)}</p>`;
  }
}

function renderPlayerProfileModalContent(targetUid, profile, career, headToHead) {
  const body = $("#player-profile-modal-body");
  if (!body) return;
  const isOrg = profile.role === "organisateur";
  const activeTags = (profile.tags?.active || []).map((id) => findAnyTag(id)).filter(Boolean);
  const tagsHtml = activeTags.length
    ? activeTags
        .map((t) => {
          const icon = getTagIcon(t);
          const iconHtml =
            icon.type === "image"
              ? `<img class="tag-emoji-img" src="${icon.value}" alt=""> `
              : icon.type === "emoji"
              ? escapeHtmlLocal(icon.value) + " "
              : "";
          return `<span class="tag-pill" style="background:${t.color};color:${contrastTextColor(t.color)};">${iconHtml}${escapeHtmlLocal(t.name)}</span>`;
        })
        .join(" ")
    : `<span class="settings-note">Aucun tag affiché.</span>`;
  const canManage = getCurrentProfile()?.role === "organisateur" && targetUid !== getCurrentUid();
  const seasonLine =
    career.currentSeasonNumber != null
      ? `${career.currentSeasonPoints} pts — ${winsLossesHtml(career.currentSeasonWins, career.currentSeasonLosses)} — Saison ${career.currentSeasonNumber} en cours`
      : "Aucune saison en cours";
  // Bilan face-à-face entre TOI (celui qui regarde) et cette personne — voir
  // computeHeadToHead dans season.js. aWins = tes victoires contre elle
  // (vert), bWins = ses victoires contre toi, donc tes défaites (rouge).
  const headToHeadHtml = headToHead
    ? `<div class="settings-note">Face à face (toi vs ${escapeHtmlLocal(profile.pseudo)}) : ${
        headToHead.matches > 0
          ? `${winsLossesHtml(headToHead.aWins, headToHead.bWins)} sur ${headToHead.matches} match${headToHead.matches > 1 ? "s" : ""}`
          : "aucun match encore joué"
      }</div>`
    : "";

  body.innerHTML = `
    <div class="player-card" style="margin-top:0;" id="player-modal-card">
      <div class="avatar-shell" id="player-modal-avatar"></div>
      <div class="player-card-info">
        <div style="font-weight:800;">${escapeHtmlLocal(profile.pseudo)}</div>
        ${titleBadgeHtml(profile)}
        <span class="badge ${isOrg ? "badge-organizer" : "badge-player"}">${isOrg ? "🛡️ Organisateur" : "🎮 Joueur"}</span>
        <div class="settings-note">${career.lifetimePoints} pts (total) · ${winsLossesHtml(career.lifetimeWins, career.lifetimeLosses)} (tous matchs)</div>
        <div class="settings-note">${seasonLine}</div>
        ${headToHeadHtml}
      </div>
    </div>
    <div class="player-tags">${tagsHtml}</div>
    ${canManage ? `<button class="btn btn-ghost" type="button" id="player-modal-manage-btn">Gérer ce joueur →</button>` : ""}
  `;
  renderAvatar($("#player-modal-avatar"), profile, 56);
  // Le fond de profil s'applique à toute la fenêtre de la popup (titre, carte
  // et bouton "Gérer ce joueur" compris), pas seulement à la petite carte —
  // voir #player-profile-modal dans index.html.
  applyProfileBackground($("#player-profile-modal"), profile);
  $("#player-modal-manage-btn")?.addEventListener("click", () => {
    closePlayerProfileModal();
    document.dispatchEvent(new CustomEvent("cartech:manage-player", { detail: { uid: targetUid } }));
  });
}

export function closePlayerProfileModal() {
  $("#overlay-player-profile")?.classList.remove("show");
}

export function showSettingsScreen() {
  hideAllViews();
  $("#view-settings").classList.add("active");
}

// Écran séparé, réservé à l'organisateur : catalogues (décorations, thèmes,
// tags, jeux). Le bouton qui y mène n'est visible que pour l'organisateur
// (classe "organizer-only"), mais on revérifie quand même le rôle ici par
// sécurité, au cas où l'écran serait ouvert autrement.
export function showOrganizerCatalogScreen() {
  if (getCurrentProfile()?.role !== "organisateur") return;
  hideAllViews();
  $("#view-organizer-catalog").classList.add("active");
}

// ---------------------------------------------------------------------------
// Écoute de l'état de connexion (source de vérité)
// ---------------------------------------------------------------------------
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    currentProfile = null;
    currentUid = null;
    stopLiveCatalogs();
    stopHomePlayersListener();
    stopSeasonBannerListener();
    stopCareerStatsListener();
    broadcastProfile();
    showAuthScreen();
    return;
  }
  currentUid = user.uid;
  try {
    // Décorations/thèmes/tags créés par l'organisateur : chargés en direct
    // dès la connexion, pour que l'avatar/le thème du profil se mettent à
    // jour tout seuls si le catalogue arrive après le premier affichage (ou
    // change pendant que le joueur est connecté).
    startLiveCatalogs(() => {
      if (currentProfile) renderProfile(currentProfile);
    });
    // Liste des joueurs de l'écran d'accueil (disponible / en combat /
    // inactif) : démarrée dès la connexion elle aussi.
    startHomePlayersListener();
    // Bandeau "saison en cours" de l'écran d'accueil : léger (juste la
    // liste des saisons), démarré dès la connexion pour être toujours à
    // jour même sans ouvrir l'écran Saison.
    startSeasonBannerListener();
    // Stats "carrière" (points/victoires/défaites à vie + saison en cours)
    // affichées sur ma propre fiche de l'écran d'accueil — démarré dès la
    // connexion pour la même raison que le bandeau ci-dessus.
    startCareerStatsListener();
    const { profile, isNew } = await ensureUserProfile(user);
    renderProfile(profile);
    // Modale « As-tu été parrainé ? » : seulement juste après une inscription
    // (jamais à une reconnexion normale) — voir pendingReferralPrompt et
    // isNew ci-dessus pour pourquoi on se fie aux deux à la fois.
    const shouldPromptReferral = pendingReferralPrompt || isNew;
    pendingReferralPrompt = false;
    if (shouldPromptReferral) {
      showReferralModal(() => showAppScreen());
    } else {
      showAppScreen();
    }
  } catch (err) {
    showToast(friendlyError(err), true);
  }
});

// ---------------------------------------------------------------------------
// Modale « As-tu été parrainé ? » — affichée une seule fois, juste après une
// inscription (jamais revue ensuite). Étape 1 : Oui/Non. Étape 2 (si Oui) :
// pseudo du parrain, converti en uid via la même recherche que
// handleSearchPlayer (settings.js). "Non" ou une recherche infructueuse
// laissent simplement referral.referredByUid à null pour toujours (la
// modale ne revient jamais — voir isNew/pendingReferralPrompt ci-dessus).
// ---------------------------------------------------------------------------
function showReferralStep(step) {
  $("#referral-step-ask").style.display = step === "ask" ? "" : "none";
  $("#referral-step-pseudo").style.display = step === "pseudo" ? "" : "none";
  $("#referral-error").textContent = "";
}

function showReferralModal(onDone) {
  $("#referral-pseudo-input").value = "";
  showReferralStep("ask");
  $("#overlay-referral").classList.add("show");

  const finish = () => {
    $("#overlay-referral").classList.remove("show");
    onDone();
  };

  $("#btn-referral-no").onclick = finish;
  $("#btn-referral-yes").onclick = () => showReferralStep("pseudo");
  $("#btn-referral-back").onclick = () => showReferralStep("ask");
  $("#btn-referral-skip").onclick = finish;
  $("#form-referral-pseudo").onsubmit = async (e) => {
    e.preventDefault();
    const term = $("#referral-pseudo-input").value.trim().toLowerCase();
    const errEl = $("#referral-error");
    if (!term) return;
    try {
      const q = query(collection(db, "users"), where("pseudoLower", "==", term), limit(1));
      const snap = await getDocs(q);
      if (snap.empty) {
        errEl.textContent = "Aucun joueur trouvé avec ce pseudo — vérifie l'orthographe, ou passe cette étape.";
        return;
      }
      const parrainDoc = snap.docs[0];
      if (parrainDoc.id === getCurrentUid()) {
        errEl.textContent = "Tu ne peux pas te parrainer toi-même 🙂";
        return;
      }
      await updateDoc(doc(db, "users", getCurrentUid()), { "referral.referredByUid": parrainDoc.id });
      const refreshed = await getDoc(doc(db, "users", getCurrentUid()));
      if (refreshed.exists()) renderProfile(refreshed.data());
      showToast(`Parrainage enregistré avec ${parrainDoc.data().pseudo} !`);
      finish();
    } catch (err) {
      errEl.textContent = friendlyError(err);
    }
  };
}

// ---------------------------------------------------------------------------
// Onglets Connexion / Inscription
// ---------------------------------------------------------------------------
function switchAuthTab(tab) {
  document.querySelectorAll(".auth-tab").forEach((el) => {
    el.classList.toggle("active", el.dataset.tab === tab);
  });
  document.querySelectorAll(".auth-panel").forEach((el) => {
    el.classList.toggle("active", el.id === `panel-${tab}`);
  });
}

// ---------------------------------------------------------------------------
// Câblage des événements DOM
// ---------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  $("#form-signup").addEventListener("submit", handleSignup);
  $("#form-login").addEventListener("submit", handleLogin);
  $("#btn-google-signup").addEventListener("click", () => handleGoogle(true));
  $("#btn-google-login").addEventListener("click", () => handleGoogle(false));
  $("#btn-logout").addEventListener("click", handleLogout);
  $("#btn-open-settings").addEventListener("click", showSettingsScreen);
  $("#btn-close-settings").addEventListener("click", showAppScreen);
  $("#btn-open-organizer-catalog")?.addEventListener("click", showOrganizerCatalogScreen);
  $("#btn-close-organizer-catalog")?.addEventListener("click", showAppScreen);

  document.querySelectorAll(".auth-tab").forEach((el) => {
    el.addEventListener("click", () => switchAuthTab(el.dataset.tab));
  });

  $("#btn-close-player-profile")?.addEventListener("click", closePlayerProfileModal);
  $("#overlay-player-profile")?.addEventListener("click", (e) => {
    if (e.target.id === "overlay-player-profile") closePlayerProfileModal();
  });
});
