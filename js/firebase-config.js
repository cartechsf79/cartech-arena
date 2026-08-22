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
  apiKey: "AIzaSyC6Okd35i0d8ZiNeYZjV3rk_98hCUV4ECU",
  authDomain: "car-tech-arena.firebaseapp.com",
  projectId: "car-tech-arena",
  storageBucket: "car-tech-arena.firebasestorage.app",
  messagingSenderId: "393887627074",
  appId: "1:393887627074:web:8cf0c68c83b7fa65453adb",
};

// L'adresse email qui obtient automatiquement le rôle "organisateur"
// dès qu'elle crée un compte (ou se connecte via Google) sur l'appli.
// Mets ici TON adresse email, celle que tu utiliseras pour te connecter.
export const ORGANIZER_EMAIL = "cartechsf79@gmail.com";
