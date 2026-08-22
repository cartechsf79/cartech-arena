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
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import { auth, db, ORGANIZER_EMAIL } from "./firebase-init.js";
import { DEFAULT_OWNED_THEMES, findDecoration, applyTheme } from "./catalog.js";

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
    if (!("photoDataUrl" in data)) patch.photoDataUrl = null;
    if (!data.pseudoLower) patch.pseudoLower = (data.pseudo || "").toLowerCase();
    if (Object.keys(patch).length) {
      await setDoc(ref, patch, { merge: true });
      return { ...data, ...patch };
    }
    return data;
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
    createdAt: serverTimestamp(),
  };

  await setDoc(ref, profile);
  return profile;
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
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: pseudo });
    await ensureUserProfile(cred.user, pseudo);
    showToast(`Bienvenue sur Car'Tech Arena, ${pseudo} !`);
  } catch (err) {
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

async function handleGoogle() {
  try {
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(auth, provider);
    await ensureUserProfile(cred.user);
  } catch (err) {
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
  const deco = decoId ? findDecoration(decoId) : null;
  if (deco) {
    container.classList.add("has-deco", deco.css);
  }
}

export function renderProfile(profile) {
  currentProfile = profile;
  broadcastProfile();

  $("#profile-pseudo").textContent = profile.pseudo;
  $("#profile-email").textContent = profile.email;
  renderAvatar($("#profile-avatar"), profile, 54);

  const badge = $("#role-badge");
  const isOrganizer = profile.role === "organisateur";
  badge.textContent = isOrganizer ? "🛡️ Organisateur" : "🎮 Joueur";
  badge.classList.toggle("badge-organizer", isOrganizer);
  badge.classList.toggle("badge-player", !isOrganizer);

  $("#stat-points").textContent = profile.points ?? 0;
  $("#stat-wins").textContent = profile.wins ?? 0;
  $("#stat-losses").textContent = profile.losses ?? 0;

  document.querySelectorAll(".organizer-only").forEach((el) => {
    el.style.display = isOrganizer ? "" : "none";
  });

  applyTheme(profile?.theme?.active || "classique");
}

function showAuthScreen() {
  $("#view-auth").classList.add("active");
  $("#view-app").classList.remove("active");
  $("#view-settings").classList.remove("active");
  $("#view-daily-duel")?.classList.remove("active");
  applyTheme("classique");
}

function showAppScreen() {
  $("#view-auth").classList.remove("active");
  $("#view-app").classList.add("active");
  $("#view-settings").classList.remove("active");
  $("#view-daily-duel")?.classList.remove("active");
}

export function showSettingsScreen() {
  $("#view-auth").classList.remove("active");
  $("#view-app").classList.remove("active");
  $("#view-settings").classList.add("active");
  $("#view-daily-duel")?.classList.remove("active");
}

// ---------------------------------------------------------------------------
// Écoute de l'état de connexion (source de vérité)
// ---------------------------------------------------------------------------
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    currentProfile = null;
    currentUid = null;
    broadcastProfile();
    showAuthScreen();
    return;
  }
  currentUid = user.uid;
  try {
    const profile = await ensureUserProfile(user);
    renderProfile(profile);
    showAppScreen();
  } catch (err) {
    showToast(friendlyError(err), true);
  }
});

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
  $("#btn-google-signup").addEventListener("click", handleGoogle);
  $("#btn-google-login").addEventListener("click", handleGoogle);
  $("#btn-logout").addEventListener("click", handleLogout);
  $("#btn-open-settings").addEventListener("click", showSettingsScreen);
  $("#btn-close-settings").addEventListener("click", showAppScreen);

  document.querySelectorAll(".auth-tab").forEach((el) => {
    el.addEventListener("click", () => switchAuthTab(el.dataset.tab));
  });
});
