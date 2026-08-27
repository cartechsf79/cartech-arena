// ============================================================================
// Car'Tech Arena — Installation en PWA (icône sur l'écran d'accueil du
// téléphone/de l'ordinateur, ouverture en un tap sans passer par le
// navigateur). Voir manifest.json + service-worker.js + icons/.
//
// - Android/Chrome/Edge : le navigateur déclenche l'évènement
//   "beforeinstallprompt" quand l'appli est jugée installable — on le
//   capture, on l'empêche de s'afficher tout seul, et on ne le déclenche
//   (deferredPrompt.prompt()) que si le joueur clique sur notre propre
//   bouton dans Réglages.
// - iOS/Safari : aucun évènement de ce genre n'existe, l'installation se
//   fait uniquement via le bouton de partage natif > "Sur l'écran
//   d'accueil" — on affiche juste l'explication à la place d'un bouton.
// - Appli déjà installée (mode "standalone") : rien à proposer, un simple
//   message de confirmation suffit.
// ============================================================================
import { $ } from "./app.js";

const SW_URL = "./service-worker.js";

let deferredPrompt = null;

function isStandalone() {
  return (
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
    window.navigator.standalone === true
  );
}
function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent || "");
}

function updateInstallUi() {
  const btn = $("#btn-install-pwa");
  const note = $("#pwa-install-note");
  if (!btn || !note) return;

  if (isStandalone()) {
    btn.style.display = "none";
    note.textContent = "✅ L'application est déjà installée sur cet appareil.";
    return;
  }
  if (deferredPrompt) {
    btn.style.display = "";
    note.textContent =
      "Installe Car'Tech Arena comme une app sur ton téléphone ou ton ordinateur pour l'ouvrir en un tap, sans passer par le navigateur.";
    return;
  }
  if (isIos()) {
    btn.style.display = "none";
    note.innerHTML =
      "Sur iPhone/iPad : appuie sur le bouton de partage <b>⬆️</b> de Safari, puis <b>« Sur l'écran d'accueil »</b>.";
    return;
  }
  btn.style.display = "none";
  note.textContent =
    "Installation pas encore proposée par ce navigateur — réessaie depuis Chrome/Edge (Android ou ordinateur).";
}

async function installApp() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  updateInstallUi();
}

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  updateInstallUi();
});
window.addEventListener("appinstalled", () => {
  deferredPrompt = null;
  updateInstallUi();
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(SW_URL).catch((err) => {
      console.error("Service worker non enregistré :", err);
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  updateInstallUi();
  $("#btn-install-pwa")?.addEventListener("click", installApp);
});
