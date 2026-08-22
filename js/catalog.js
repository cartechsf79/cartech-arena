// ============================================================================
// Catalogues des décorations de photo de profil et des thèmes.
// Modifie librement ces listes pour ajouter/renommer des récompenses —
// aucune autre partie du code n'a besoin de changer.
// ============================================================================

// Chaque décoration est un anneau autour de la photo de profil, débloqué
// uniquement par l'organisateur (jamais achetable ni gagnable seul par le joueur
// depuis l'appli elle-même).
export const DECORATIONS = [
  { id: "cercle-dore", label: "Cercle Doré", categorie: "Payer", css: "deco-or" },
  { id: "flamme-tournoi", label: "Flamme du Tournoi", categorie: "Tournoi", css: "deco-flamme" },
  { id: "etoile-compete", label: "Étoile de Compétition", categorie: "Compète", css: "deco-etoile" },
  { id: "confettis-evenement", label: "Confettis d'Événement", categorie: "Événement", css: "deco-confettis" },
];

export function findDecoration(id) {
  return DECORATIONS.find((d) => d.id === id) || null;
}

// Les 3 premiers thèmes sont débloqués pour tout le monde dès la création du
// compte. Les thèmes "Trophée" sont verrouillés et ne peuvent être débloqués
// que par l'organisateur (récompense de tournoi/concours).
export const THEMES = [
  { id: "classique", label: "Classique", locked: false },
  { id: "sombre", label: "Sombre", locked: false },
  { id: "clair", label: "Clair", locked: false },
  { id: "trophee-or", label: "Trophée Or", locked: true },
  { id: "trophee-argent", label: "Trophée Argent", locked: true },
  { id: "trophee-bronze", label: "Trophée Bronze", locked: true },
];

export const DEFAULT_OWNED_THEMES = THEMES.filter((t) => !t.locked).map((t) => t.id);

export function findTheme(id) {
  return THEMES.find((t) => t.id === id) || null;
}

export function applyTheme(themeId) {
  const theme = findTheme(themeId) || findTheme("classique");
  document.body.setAttribute("data-theme", theme.id);
}

// ---------------------------------------------------------------------------
// Jeux et formats disponibles pour un duel / un événement
// ---------------------------------------------------------------------------
export const GAMES = ["Pokémon TCG", "Lorcana", "One Piece Card Game"];

export const FORMATS = [
  { id: "bo1", label: "BO1 (1 manche)", games: 1 },
  { id: "bo3", label: "BO3 (jusqu'à 3 manches)", games: 3 },
  { id: "bo5", label: "BO5 (jusqu'à 5 manches)", games: 5 },
];

export function findFormat(id) {
  return FORMATS.find((f) => f.id === id) || FORMATS[0];
}
