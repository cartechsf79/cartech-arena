# Car'Tech Arena — Duel du jour (v3)

Cette version ajoute le **Duel du jour** : la session en boutique où les
joueurs présents peuvent se défier en direct, avec validation par
l'organisateur. Tout se met à jour en temps réel (sans recharger la page),
sur tous les téléphones connectés à la fois.

## Comment ça marche

Toujours un site 100% statique, sans build ni `npm install` : le SDK Firebase
est chargé depuis son CDN directement dans le navigateur.

```
index.html
css/style.css
js/firebase-config.js   <- tes clés Firebase (déjà remplies)
js/firebase-init.js     <- initialise Firebase une seule fois, partagé
js/catalog.js           <- décorations, thèmes, jeux et formats disponibles
js/app.js               <- inscription / connexion / rôle
js/settings.js          <- tout l'écran Paramètres
js/daily-duel.js        <- le Duel du jour (nouveau dans cette version)
firestore.rules         <- règles de sécurité à coller dans Firebase
```

Petite précision sur le stockage des photos : comme le plan gratuit Firebase
(Spark) ne permet plus d'utiliser "Cloud Storage" sans activer la
facturation, les photos de profil sont stockées directement dans Firestore,
sous forme d'image compressée (recadrée en 512×512 et convertie en JPEG
léger). Ça reste largement dans le 1 Go gratuit de Firestore et ça évite
d'avoir à activer un mode payant.

## Mise à jour depuis la v2 — à faire une seule fois

1. **Republie les fichiers** : sur ton dépôt GitHub, remplace tous les
   fichiers par ceux de ce dossier (glisse-dépose tout par-dessus, "Commit
   changes" — GitHub écrase les fichiers existants et ajoute les nouveaux,
   dont le nouveau `js/daily-duel.js`). `js/firebase-config.js` contient
   déjà tes vraies clés et ton email organisateur, pas besoin d'y retoucher.

2. **Republie les règles Firestore** : Firebase Console > Firestore Database
   > onglet "Règles" > remplace tout le contenu par celui de
   `firestore.rules` (celui-ci ajoute les règles pour le Duel du jour, en
   plus de tout ce qui existait déjà) > "Publier". **Cette étape est
   indispensable** : sans elle, le Duel du jour ne fonctionnera pas (accès
   refusé par Firebase).

3. Vercel redéploiera automatiquement dès que GitHub reçoit les nouveaux
   fichiers.

C'est tout — pas de nouveau projet Firebase à créer, pas de nouvelle
autorisation à donner. Les comptes déjà créés continueront de fonctionner
normalement.

## Ce qui est ajouté dans cette version — le Duel du jour

Un nouveau bouton **⚔️ Duel du jour** apparaît sur l'écran principal, pour
tout le monde.

**Côté organisateur**, un panneau de gestion apparaît en haut de cet écran :
- **Ouvrir la session** (avec une heure de fin optionnelle, juste
  informative — c'est toujours toi qui fermes la session avec le bouton
  "Fermer la session").
- **Demandes en attente** : chaque joueur qui clique sur "Demande à
  rejoindre" apparaît ici avec ✅ (valider) / ❌ (refuser). Ça te permet de
  vérifier que la personne est bien présente dans la boutique.
- **Joueurs présents** : tous les joueurs validés, avec un bouton
  "Exclure" pour en retirer un à tout moment (en cas de souci).

**Côté joueur**, une fois validé :
- Il voit la liste des autres joueurs **disponibles** en direct (pas besoin
  de rafraîchir la page).
- Il clique sur "Proposer duel" pour un adversaire : choix du jeu (Pokémon
  TCG / Lorcana / One Piece Card Game) et du format (BO1/BO3/BO5).
- L'adversaire reçoit la proposition **instantanément** et peut
  accepter/refuser.
- Une fois le duel accepté, chacun saisit **son propre score et le score de
  l'adversaire tel qu'il l'a compris**, puis coche "J'ai gagné" ou non. Le
  duel n'est validé que si les deux déclarations concordent ; sinon un
  message d'erreur reste affiché aux deux joueurs jusqu'à correction.
- Un bouton **"Quitter le duel du jour"** est toujours disponible pour se
  retirer soi-même.

Tout se met à jour en direct sur tous les téléphones grâce aux écouteurs
temps réel de Firestore — personne n'a besoin de rafraîchir sa page pour
voir une nouvelle proposition, un joueur qui arrive, ou un résultat validé.

**Important, en toute transparence** : pour cette première version, les
statistiques générales du profil (points / victoires / défaites affichées
sur l'écran principal) ne sont **pas encore** mises à jour automatiquement
par les résultats du Duel du jour. Je m'en suis délibérément abstenu pour
l'instant, le temps de construire un vrai classement général qui compilera
l'historique de tous les duels (plutôt que d'incrémenter des compteurs à la
main, ce qui demanderait des serveurs payants pour rester fiable en cas de
triche ou de bug réseau). Ce sera la prochaine étape naturelle après
l'Événement.

## Ce qui n'est pas encore fait (prochaine étape)

- **L'Événement** (tournoi façon "suisse") : création par l'organisateur,
  inscriptions, rondes automatiques par niveau, minuteur par manche, classement
  final avec message de félicitations — comme décrit, avec un historique des
  événements passés accessible depuis la gauche.
- Le classement général basé sur l'historique des duels et des événements.
- Les "Tags" affichés sur le profil d'un joueur (actuellement un
  emplacement vide, prêt à être rempli plus tard).
