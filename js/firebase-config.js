// ============================================================================
// CONFIGURATION FIREBASE — Car'Tech Arena
// ============================================================================
// 1. Va sur https://console.firebase.google.com et crée un NOUVEAU projet
//    (un projet séparé de ton appli de caisse, comme on en a parlé).
// 2. Dans "Paramètres du projet" > "Général", descends jusqu'à "Vos applications",
//    clique sur l'icône Web ( </> ), donne un nom (ex: "cartech-arena-web"),
//    et copie l'objet de config qu'on te donne à la fin.
// 3. Remplace les valeurs ci-dessous par les tiennes.
// 4. Active l'authentification : Firebase Console > Build > Authentication >
//    Sign-in method > active "E-mail/Mot de passe" ET "Google".
// 5. Crée une base Firestore : Build > Firestore Database > Créer une base
//    (mode production), puis colle le contenu de firestore.rules (voir ce fichier)
//    dans l'onglet "Règles".
// ============================================================================

export const firebaseConfig = {
  apiKey: "REMPLACE_MOI",
  authDomain: "REMPLACE_MOI.firebaseapp.com",
  projectId: "REMPLACE_MOI",
  storageBucket: "REMPLACE_MOI.appspot.com",
  messagingSenderId: "REMPLACE_MOI",
  appId: "REMPLACE_MOI",
};

// L'adresse email qui obtient automatiquement le rôle "organisateur"
// dès qu'elle crée un compte (ou se connecte via Google) sur l'appli.
// Mets ici TON adresse email, celle que tu utiliseras pour te connecter.
export const ORGANIZER_EMAIL = "steven.forfert@gmail.com";
