// ============================================================================
// Car'Tech Arena — visite guidée pour les nouveaux arrivants.
// Affichée automatiquement une seule fois, juste après la toute première
// inscription (voir app.js), ET rejouable à tout moment via le bouton
// "❓ Aide" des Réglages (voir settings.js).
//
// "Vu une fois" est mémorisé en local (localStorage), pas dans Firestore :
// un simple repère "j'ai déjà vu la visite sur CET appareil" suffit
// largement pour ce genre d'onboarding (comme la plupart des applis) — pas
// besoin d'un champ de plus sur le profil ni d'une règle Firestore
// supplémentaire pour ça.
// ============================================================================
const SEEN_KEY = "cartech_tutorial_seen";

const STEPS = [
  {
    selector: "#btn-open-daily-duel",
    title: "⚔️ Duel du jour",
    text: "Affronte un autre joueur présent en boutique aujourd'hui : propose un duel, choisis le jeu et le format, puis enregistre le résultat une fois la partie terminée.",
  },
  {
    selector: "#btn-open-event",
    title: "🏆 Événement",
    text: "Inscris-toi à un tournoi organisé par la boutique et retrouve ton classement au fil des rondes.",
  },
  {
    selector: "#btn-open-calendar",
    title: "📅 Calendrier",
    text: "Regarde les prochaines sessions annoncées par la boutique et dis si ça t'intéresse, en un clic — sans inscription ni validation.",
  },
  {
    selector: "#btn-open-season",
    title: "🏅 Saison actuelle",
    text: "Suis ton classement et tes points au fil de la saison en cours.",
  },
  {
    selector: "#btn-open-settings",
    title: "⚙️ Paramètres",
    text: "Personnalise ton profil (photo, décorations, thème, titre…) — et retrouve aussi ton QR code de parrainage et ta carte de joueur à partager.",
  },
];

let stepIndex = 0;
let els = null; // { backdrop, highlight, card } créés à la demande
let active = false;
// Incrémenté à chaque renderStep() : les callbacks différés de repositionnement
// (requestAnimationFrame/setTimeout, voir renderStep ci-dessous) se comparent
// à cette valeur avant d'agir, pour ignorer un callback "périmé" — soit parce
// que la visite a déjà été fermée entre-temps (ce qui recréerait sinon un
// overlay fantôme vide via ensureElements(), voir positionAround), soit parce
// que l'étape a déjà changé (le joueur a cliqué "Suivant" très vite).
let renderToken = 0;

function hasSeenTutorial() {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false; // pas grave : au pire la visite se réaffiche une fois de plus
  }
}
function markTutorialSeen() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // stockage local indisponible (navigation privée, quota…) : sans
    // conséquence grave, la visite pourra juste réapparaître une prochaine fois.
  }
}

function ensureElements() {
  if (els) return els;
  const backdrop = document.createElement("div");
  backdrop.id = "tutorial-backdrop";
  backdrop.className = "tutorial-backdrop";

  const highlight = document.createElement("div");
  highlight.className = "tutorial-highlight";

  const card = document.createElement("div");
  card.className = "tutorial-card";

  document.body.appendChild(backdrop);
  document.body.appendChild(highlight);
  document.body.appendChild(card);
  els = { backdrop, highlight, card };
  return els;
}

function positionAround(target) {
  // Ne JAMAIS recréer l'overlay ici : cette fonction n'est appelée que par des
  // callbacks potentiellement différés (voir renderToken ci-dessus) — si la
  // visite est déjà fermée (els === null), il n'y a simplement plus rien à
  // positionner.
  if (!els) return;
  const { highlight, card } = els;
  const rect = target.getBoundingClientRect();
  const pad = 8;
  highlight.style.top = rect.top - pad + "px";
  highlight.style.left = rect.left - pad + "px";
  highlight.style.width = rect.width + pad * 2 + "px";
  highlight.style.height = rect.height + pad * 2 + "px";

  // Place la bulle sous la cible si la place ne manque pas, sinon au-dessus.
  const cardWidth = Math.min(320, window.innerWidth - 24);
  card.style.width = cardWidth + "px";
  let top = rect.bottom + pad + 10;
  const estCardHeight = 150;
  if (top + estCardHeight > window.innerHeight) {
    top = Math.max(12, rect.top - pad - estCardHeight);
  }
  let left = rect.left;
  if (left + cardWidth > window.innerWidth - 12) left = window.innerWidth - cardWidth - 12;
  if (left < 12) left = 12;
  card.style.top = top + "px";
  card.style.left = left + "px";
}

function renderStep() {
  const { card } = ensureElements();
  const step = STEPS[stepIndex];
  const target = document.querySelector(step.selector);
  if (!target) {
    // Bouton introuvable sur cet écran (ne devrait pas arriver, la visite ne
    // démarre que depuis l'accueil) : on saute l'étape plutôt que de bloquer.
    nextStep();
    return;
  }
  target.scrollIntoView({ block: "center", behavior: "smooth" });

  card.innerHTML = `
    <div class="tutorial-step-count">Étape ${stepIndex + 1} / ${STEPS.length}</div>
    <h3>${step.title}</h3>
    <p>${step.text}</p>
    <div class="tutorial-actions">
      <button type="button" class="btn-mini btn-mini-ghost" id="tutorial-btn-skip">Passer</button>
      <button type="button" class="btn btn-primary" id="tutorial-btn-next">${
        stepIndex === STEPS.length - 1 ? "Terminer" : "Suivant →"
      }</button>
    </div>
  `;
  positionAround(target);
  // Repositionne une fois de plus une fois le scroll terminé — protégé par
  // renderToken contre un callback périmé (voir la note à sa déclaration).
  const myToken = ++renderToken;
  const reposition = () => {
    if (myToken !== renderToken) return;
    positionAround(target);
  };
  requestAnimationFrame(reposition);
  setTimeout(reposition, 350);

  document.getElementById("tutorial-btn-next").onclick = nextStep;
  document.getElementById("tutorial-btn-skip").onclick = closeTutorial;
}

function nextStep() {
  stepIndex++;
  if (stepIndex >= STEPS.length) {
    closeTutorial();
    return;
  }
  renderStep();
}

function closeTutorial() {
  markTutorialSeen();
  active = false;
  renderToken++; // invalide tout callback de repositionnement encore en vol
  if (!els) return;
  els.backdrop.remove();
  els.highlight.remove();
  els.card.remove();
  els = null;
  window.removeEventListener("resize", onResize);
}

function onResize() {
  if (!els) return;
  const step = STEPS[stepIndex];
  const target = step && document.querySelector(step.selector);
  if (target) positionAround(target);
}

export function showTutorial() {
  // Protège contre un double déclenchement (onAuthStateChanged peut se
  // déclencher plus d'une fois pour la même connexion, voir les commentaires
  // "filet de sécurité" dans app.js) : un 2e appel pendant que la visite est
  // déjà affichée ne fait rien plutôt que de perturber l'étape en cours.
  if (active) return;
  active = true;
  stepIndex = 0;
  ensureElements();
  window.addEventListener("resize", onResize);
  renderStep();
}

// Appelée après une inscription (voir app.js) : ne montre la visite que si
// elle n'a jamais été vue sur cet appareil.
export function maybeShowTutorialForNewAccount() {
  if (hasSeenTutorial()) return;
  showTutorial();
}
