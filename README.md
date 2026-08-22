# Car'Tech Arena — Système de comptes (v1)

Cette première version met en place la brique de base : création de compte,
connexion, et distinction entre les comptes **joueur** et **organisateur**
(le tien). Pas encore de système de défis — ça viendra à l'étape suivante,
une fois que les comptes fonctionnent bien.

## Comment ça marche

C'est un site 100% statique : `index.html` + `css/style.css` + `js/app.js`.
Pas de build, pas de `npm install`, pas de serveur à écrire — le SDK Firebase
est chargé directement depuis le CDN de Google dans le navigateur. Tu peux
ouvrir `index.html` n'importe où (Vercel, Firebase Hosting, GitHub Pages...),
tant que la configuration Firebase ci-dessous est renseignée.

## Mise en place (à faire une seule fois)

1. **Crée un nouveau projet Firebase** (séparé de ta caisse) sur
   [console.firebase.google.com](https://console.firebase.google.com).

2. **Ajoute une application Web** : dans "Paramètres du projet" > "Général" >
   "Vos applications", clique l'icône `</>`, donne-lui un nom
   (ex. `cartech-arena-web`). Firebase t'affiche un objet `firebaseConfig`.

3. **Colle ces valeurs** dans `js/firebase-config.js`, à la place des
   `"REMPLACE_MOI"`.

4. **Active les connexions** : Build > Authentication > Sign-in method >
   active **Email/Password** et **Google**.

5. **Crée la base Firestore** : Build > Firestore Database > Créer une base
   (choisis "mode production").

6. **Colle les règles de sécurité** : dans Firestore Database > onglet
   "Règles", remplace tout le contenu par celui de `firestore.rules`
   (à la racine de ce dossier), puis clique "Publier".

7. Dans `js/firebase-config.js`, vérifie que `ORGANIZER_EMAIL` correspond bien
   à l'adresse email avec laquelle **toi** tu vas créer ton compte — c'est
   cette adresse qui recevra automatiquement le rôle "organisateur".

## Tester en local

Comme le site utilise des modules JavaScript (`type="module"`), les
navigateurs refusent de les charger si tu ouvres `index.html` directement en
double-cliquant dessus (erreur CORS). Il faut le servir via un petit serveur
local. Depuis ce dossier :

```bash
npx serve .
```

puis ouvre l'adresse affichée (en général `http://localhost:3000`).

## Déployer

Le plus simple avec ta stack actuelle (GitHub + Vercel) :

1. Pousse ce dossier dans un nouveau dépôt GitHub.
2. Sur [vercel.com](https://vercel.com), "Add New Project" > importe ce
   dépôt. Comme c'est un site statique, Vercel n'a besoin d'aucune
   configuration de build particulière (laisse les champs par défaut, ou
   choisis "Other" comme framework).
3. Une fois déployé, ouvre l'URL Vercel et crée ton compte organisateur avec
   ton email.

## Ce qui est déjà fait

- Création de compte par email + mot de passe, avec un pseudo.
- Connexion par email + mot de passe.
- Connexion avec Google (crée aussi un compte automatiquement au premier
  essai).
- Un profil Firestore (`users/{uid}`) est créé pour chaque compte, avec :
  `pseudo`, `email`, `role` (`joueur` ou `organisateur`), `points`, `wins`,
  `losses`.
- Ton adresse email obtient automatiquement le rôle `organisateur`, vérifié
  à la fois côté site ET côté règles de sécurité Firestore (donc impossible à
  falsifier pour un joueur).
- Écran "Espace organisateur" qui n'apparaît que sur ton compte — pour
  l'instant vide, prêt à accueillir les futurs outils (gestion des défis,
  validation des litiges, etc.).

## Ce qui n'est pas encore fait (prochaine étape)

- Le système de défis entre joueurs (lancer un défi, accepter, déclarer un
  résultat, classement général) — celui qu'on avait maquetté. Il se
  branchera sur ces mêmes comptes.
- Les outils spécifiques à l'organisateur (par ex. trancher un litige sur un
  résultat contesté, ajouter d'autres organisateurs, gérer la liste des
  jeux disponibles).
