// ============================================================================
// Car'Tech Arena — logique de compte (inscription / connexion / rôles)
// ============================================================================
// Ce fichier utilise le SDK Firebase (v10, "modular") chargé directement
// depuis le CDN officiel de Google — pas besoin de npm install, pas besoin
// de build : ces fichiers fonctionnent tels quels dans un navigateur.
// ============================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import { firebaseConfig, ORGANIZER_EMAIL } from "./firebase-config.js";

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = (sel) => document.querySelector(sel);

let currentProfile = null; // { pseudo, email, role, points, wins, losses }

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
  "auth/network-request-failed": "Problème de connexion réseau. Réessaie.",
};

function friendlyError(err) {
  return ERROR_MESSAGES[err?.code] || "Une erreur est survenue. Réessaie.";
}

function showToast(msg, isError = false) {
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
async function ensureUserProfile(user, pseudoFromSignup) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    return snap.data();
  }

  // Premier login : on crée le profil. Le rôle "organisateur" n'est accordé
  // que si l'email correspond à ORGANIZER_EMAIL — et de toute façon, les
  // règles de sécurité Firestore (firestore.rules) revérifient cette
  // condition côté serveur, donc un client trafiqué ne peut pas se
  // l'attribuer lui-même.
  const isOrganizer =
    (user.email || "").toLowerCase() === ORGANIZER_EMAIL.toLowerCase();

  const profile = {
    pseudo: pseudoFromSignup || user.displayName || (user.email || "").split("@")[0],
    email: user.email,
    role: isOrganizer ? "organisateur" : "joueur",
    points: 0,
    wins: 0,
    losses: 0,
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
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: pseudo });
    await ensureUserProfile(cred.user, pseudo);
    showToast(`Bienvenue sur Car'Tech Arena, ${pseudo} !`);
  } catch (err) {
    showToast(friendlyError(err), true);
  } finally {
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
function renderProfile(profile) {
  currentProfile = profile;
  $("#profile-pseudo").textContent = profile.pseudo;
  $("#profile-email").textContent = profile.email;

  const badge = $("#role-badge");
  const isOrganizer = profile.role === "organisateur";
  badge.textContent = isOrganizer ? "🛡️ Organisateur" : "🎮 Joueur";
  badge.classList.toggle("badge-organizer", isOrganizer);
  badge.classList.toggle("badge-player", !isOrganizer);

  $("#stat-points").textContent = profile.points ?? 0;
  $("#stat-wins").textContent = profile.wins ?? 0;
  $("#stat-losses").textContent = profile.losses ?? 0;

  // Le lien / la zone "Organisateur" n'apparaît que pour ton compte.
  document.querySelectorAll(".organizer-only").forEach((el) => {
    el.style.display = isOrganizer ? "" : "none";
  });
}

function showAuthScreen() {
  $("#view-auth").classList.add("active");
  $("#view-app").classList.remove("active");
}

function showAppScreen() {
  $("#view-auth").classList.remove("active");
  $("#view-app").classList.add("active");
}

// ---------------------------------------------------------------------------
// Écoute de l'état de connexion (source de vérité)
// ---------------------------------------------------------------------------
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    currentProfile = null;
    showAuthScreen();
    return;
  }
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

  document.querySelectorAll(".auth-tab").forEach((el) => {
    el.addEventListener("click", () => switchAuthTab(el.dataset.tab));
  });
});
