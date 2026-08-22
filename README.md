# Car'Tech Arena — Comptes + Paramètres (v2)

Cette version ajoute l'écran **Paramètres** au système de comptes déjà en
place : changer de pseudo, changer de mot de passe, changer de photo de
profil, débloquer des décorations et des thèmes (attribués par
l'organisateur), voir le profil d'un autre joueur, et supprimer son compte.
Toujours pas de système de défis — ça reste la prochaine étape.

## Comment ça marche

Toujours un site 100% statique, sans build ni `npm install` : le SDK Firebase
est chargé depuis son CDN directement dans le navigateur.

```
index.html
css/style.css
js/firebase-config.js   <- tes clés Firebase (déjà remplies)
js/firebase-init.js     <- initialise Firebase une seule fois, partagé
js/catalog.js           <- liste des décorations et des thèmes disponibles
js/app.js               <- inscription / connexion / rôle
js/settings.js          <- tout l'écran Paramètres
firestore.rules         <- règles de sécurité à coller dans Firebase
```

Petite précision sur le stockage des photos : comme le plan gratuit Firebase
(Spark) ne permet plus d'utiliser "Cloud Storage" sans activer la
facturation, les photos de profil sont stockées directement dans Firestore,
sous forme d'image compressée (recadrée en 512×512 et convertie en JPEG
léger). Ça reste largement dans le 1 Go gratuit de Firestore et ça évite
d'avoir à activer un mode payant.

## Mise à jour depuis la v1 — à faire une seule fois

1. **Republie les fichiers** : sur ton dépôt GitHub, remplace tous les
   fichiers par ceux de ce dossier (glisse-dépose tout par-dessus, "Commit
   changes" — GitHub écrase les fichiers existants et ajoute les nouveaux).
   `js/firebase-config.js` contient déjà tes vraies clés et ton email
   organisateur, pas besoin d'y retoucher.

2. **Republie les règles Firestore** : Firebase Console > Firestore Database
   > onglet "Règles" > remplace tout le contenu par celui de
   `firestore.rules` (celui-ci est différent de la v1 : il autorise
   maintenant la suppression de compte et la gestion des décorations/thèmes)
   > "Publier".

3. Vercel redéploiera automatiquement dès que GitHub reçoit les nouveaux
   fichiers.

C'est tout — pas de nouveau projet Firebase à créer, pas de nouvelle
autorisation à donner. Les 2 comptes déjà créés (le tien et celui de test)
continueront de fonctionner normalement ; ils recevront juste
automatiquement les nouveaux champs (décorations, thème) dès leur première
connexion après la mise à jour.

## Ce qui est ajouté dans cette version

- **Pseudo** : modifiable à tout moment depuis Paramètres.
- **Mot de passe** : modifiable (redemande le mot de passe actuel par
  sécurité). Masqué automatiquement pour les comptes connectés uniquement
  via Google (rien à gérer dans ce cas).
- **Photo de profil** : import d'une image, recadrage carré + redimension
  512×512 + compression automatique côté navigateur.
- **Décorations de photo de profil** : anneaux visuels autour de l'avatar
  (Payer / Tournoi / Compète / Événement). Un joueur ne peut choisir que
  parmi celles qu'il possède déjà — **seul le compte organisateur peut en
  débloquer** pour un joueur (via "Voir le profil d'un joueur").
- **Thèmes** : Classique / Sombre / Clair débloqués pour tout le monde dès
  la création du compte ; les thèmes "Trophée" (Or/Argent/Bronze) sont
  verrouillés et débloqués uniquement par l'organisateur.
- **Voir le profil d'un joueur** : recherche par pseudo exact, affiche sa
  photo, son rôle, ses stats, et un espace "Tags" (vide pour l'instant,
  prévu pour plus tard). Si tu es organisateur, un panneau supplémentaire
  apparaît pour attribuer/retirer décorations et thèmes à ce joueur.
- **Suppression de compte** : confirmation en 2 étapes (avertissement, puis
  recopie d'un code à 4 chiffres généré aléatoirement) + reconfirmation du
  mot de passe (ou de Google) avant suppression réelle et définitive.
- Les règles de sécurité Firestore ont été mises à jour en conséquence :
  un joueur ne peut jamais s'attribuer lui-même une décoration/un thème
  verrouillé, ni changer son propre rôle ou ses points ; seul l'organisateur
  peut le faire pour les autres comptes.

## Ce qui n'est pas encore fait (prochaine étape)

- Le système de défis entre joueurs (lancer un défi, accepter, choisir le
  jeu et le format, déclarer un résultat avec double confirmation,
  classement général) — celui qu'on avait maquetté au tout début. Il se
  branchera sur ces mêmes comptes et profils.
- Les "Tags" affichés sur le profil d'un joueur (actuellement un
  emplacement vide, prêt à être rempli plus tard).
