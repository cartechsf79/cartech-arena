# Car'Tech Arena — v6

Cette version corrige un bug important (des décorations/thèmes attribués
qui refusaient de s'activer sur certains comptes), sépare l'espace
organisateur des Paramètres standards dans son propre écran, et permet
d'ajouter un nouveau jeu (TCG) directement depuis l'appli, sans avoir à me
redemander de modifier le code.

Elle inclut toujours tout ce qui a été ajouté en v5 : décorations de photo
(statiques ou animées), thèmes de couleurs, tags — tous créables et
modifiables par toi directement depuis l'appli — un recadrage de photo
digne d'une vraie appli (zoom + position), et une **liste des joueurs** sur
l'écran d'accueil qui montre en direct qui est disponible en boutique, en
duel, ou pas là.

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
js/daily-duel.js        <- le Duel du jour
js/event.js             <- l'Événement
js/live-catalog.js      <- décorations/thèmes/tags/jeux créés par toi
js/home-players.js      <- liste des joueurs de l'écran d'accueil
firestore.rules         <- règles de sécurité à coller dans Firebase
```

Petite précision sur le stockage des photos : comme le plan gratuit Firebase
(Spark) ne permet plus d'utiliser "Cloud Storage" sans activer la
facturation, les photos de profil sont stockées directement dans Firestore,
sous forme d'image compressée (recadrée en 512×512 et convertie en JPEG
léger). Ça reste largement dans le 1 Go gratuit de Firestore et ça évite
d'avoir à activer un mode payant.

## Mise à jour depuis la v5 — à faire une seule fois

1. **Republie les fichiers** : sur ton dépôt GitHub (le bon projet — celui
   lié à ton domaine `car-tech-arena.vercel.app`), remplace tous les
   fichiers par ceux de ce dossier (glisse-dépose tout par-dessus, "Commit
   changes"). `js/firebase-config.js` contient déjà tes vraies clés et ton
   email organisateur, pas besoin d'y retoucher.

2. **Republie les règles Firestore — cette étape est indispensable pour le
   correctif du bug de cette version** : Firebase Console > Firestore
   Database > onglet "Règles" > remplace tout le contenu par celui de
   `firestore.rules` > "Publier". Sans cette republication, le bug
   "décoration/thème qui refuse de s'activer" (voir plus bas) n'est **pas**
   corrigé, et le nouveau catalogue de jeux ne fonctionnera pas non plus
   (accès refusé par Firebase).

3. Vercel redéploiera automatiquement dès que GitHub reçoit les nouveaux
   fichiers.

C'est tout — pas de nouveau projet Firebase à créer, pas de nouvelle
autorisation à donner. Les comptes déjà créés continueront de fonctionner
normalement, et le compte qui avait le souci de décoration/thème bloqué se
débloque automatiquement dès qu'il clique sur une décoration ou un thème
(pas besoin de le recréer).

## Corrigé dans cette version — décoration/thème qui refusait de s'activer

**Le souci** : sur un compte auquel tu avais attribué une décoration ou un
thème, cliquer dessus pour l'activer donnait "Action refusée (droits
insuffisants)" — pareil pour les thèmes.

**La cause** : dans les règles de sécurité, la vérification "le thème/la
décoration choisi est bien parmi ceux que je possède" s'appliquait à
**tout le document du compte**, à chaque modification — même une
modification qui n'avait rien à voir. Si jamais une décoration ou un thème
actif chez un joueur avait été retiré entre-temps (par exemple si tu avais
cliqué deux fois par erreur sur "Donner" pour le retirer), son compte
restait bloqué **pour toujours** : plus aucune modification n'était
possible dessus, ni les décorations, ni les thèmes, ni rien d'autre, tant
que la valeur incohérente restait en place.

**Le correctif** : les règles laissent maintenant toujours passer une
modification qui ne touche pas au champ concerné, même si ce champ était
déjà dans un état incohérent — seule une nouvelle valeur invalide reste
refusée. En clair : un compte bloqué se débloque tout seul dès la première
interaction (clique sur une décoration, un thème, n'importe quoi), sans
rien à faire de ton côté. J'en ai profité pour renforcer aussi le bouton
"Donner/Retirer" côté organisateur : si tu retires une décoration/un
thème/un tag qui était actuellement affiché par un joueur, ça le désactive
automatiquement au même moment, pour ne plus jamais recréer ce genre de
blocage.

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
  TCG / Lorcana / One Piece Card Game, ou tout jeu que tu as ajouté depuis
  l'Espace organisateur) et du format (BO1/BO3/BO5).
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

## Ce qui est ajouté dans cette version — l'Événement

Un nouveau bouton **🏆 Événement** apparaît sur l'écran principal, pour tout
le monde, ainsi qu'un bouton **📜 Historique des événements**.

**Côté organisateur**, un panneau de gestion apparaît en haut de l'écran
Événement :
- **Créer un événement** : choix du jeu, du format (BO1/BO3/BO5) et du temps
  accordé par manche (en minutes). Un seul événement peut être ouvert à la
  fois.
- **Demandes en attente** / **Inscrits** : comme pour le Duel du jour, tu
  valides ✅ ou refuses ❌ chaque demande, et tu peux exclure un joueur
  inscrit à tout moment tant que l'événement n'a pas démarré.
- **Démarrer l'événement** : répartit tous les joueurs inscrits en
  affrontements pour la manche 1, au hasard (avec un "tour de repos"
  automatique si le nombre de joueurs est impair).
- **Démarrer la manche** : lance le chronomètre partagé, visible par tous.
- Une fois tous les matchs de la manche validés, tu vois soit **"Lancer le
  prochain regroupement"** (les joueurs sont réappariés par nombre de
  victoires : les invaincus entre eux, les autres entre eux, etc.), soit
  **"🏆 Voir les résultats finaux"** dès qu'il ne reste plus qu'un seul
  joueur invaincu.

**Côté joueur**, une fois inscrit et l'événement démarré :
- Il voit en direct son adversaire de la manche (ou "tour de repos" s'il n'y
  en a pas cette manche-ci), avec le chronomètre de l'organisateur.
- Il saisit le score de **chaque manche du format** (1, 3 ou 5 selon
  BO1/BO3/BO5) avec le score adverse tel qu'il l'a compris, comme pour le
  Duel du jour : le résultat n'est validé que si les deux joueurs
  concordent.
- Une fois l'événement terminé, il voit sa **place finale** ("Félicitations
  pour la 2ème place !").
- Un bouton **"Quitter l'événement"** reste disponible à tout moment.

**L'historique des événements** liste tous les événements terminés (jeu,
format, date) ; cliquer sur l'un d'eux affiche le classement complet avec la
place de chaque participant.

**Important, en toute transparence** — quelques limites assumées pour cette
version-là :
- Les statistiques générales du profil (points / victoires / défaites sur
  l'écran principal) ne sont **toujours pas** mises à jour automatiquement,
  ni par le Duel du jour ni par l'Événement — même raison que dans les
  versions précédentes : je préfère construire un vrai classement général
  basé sur tout l'historique plutôt que des compteurs qu'un client pourrait
  fausser.
- En cas d'égalité de victoires/défaites en fin d'événement, le classement
  ne départage pas selon un vrai système de tie-break (Buchholz, etc.) —
  c'est un tri simple qui reste stable mais pas rigoureusement équitable
  entre deux joueurs à égalité parfaite.
- Un joueur qui quitte ou est exclu **après le démarrage** de l'événement
  n'est pas géré proprement (ses matchs en cours resteront en attente) —
  pour l'instant, exclure un joueur ne fonctionne de façon fiable qu'avant
  le démarrage. Si le cas se présente en boutique, le plus simple reste de
  terminer l'événement normalement en laissant ce joueur de côté pour les
  prochaines manches.

## Nouveau dans cette version — Espace organisateur séparé

L'écran **🛡️ Espace organisateur** (décorations, thèmes, tags, jeux) n'est
plus une section au milieu des Paramètres standards — c'est maintenant un
écran à part entière, accessible depuis l'écran d'accueil via le bouton
**🛡️ Décorations, thèmes, tags & jeux** (visible seulement pour ton
compte, juste au-dessus de "Se déconnecter"). Les Paramètres restent
l'écran où tout le monde (toi y compris) gère son propre pseudo, mot de
passe, photo, décoration/thème/tag actifs, et cherche le profil d'un
joueur.

## Nouveau dans cette version — ajout d'un jeu (TCG) depuis l'appli

Dans l'écran **🛡️ Espace organisateur**, une nouvelle section **Jeux
(TCG)** te permet d'ajouter un jeu (nom seulement, ex : "Digimon Card
Game") sans avoir à me redemander de modifier le code. Le nouveau jeu
apparaît immédiatement dans les choix de jeu du Duel du jour et de
l'Événement, pour tout le monde. Les 3 jeux d'origine (Pokémon TCG,
Lorcana, One Piece Card Game) restent toujours disponibles et ne peuvent
pas être supprimés depuis l'appli.

## Ce qui est ajouté depuis la v5 — personnalisation des profils

### Décorations, thèmes et tags créés par toi

Dans l'écran **🛡️ Espace organisateur** (voir ci-dessus) :
- **Décorations de photo de profil** : donne un nom, choisis "Statique
  (image)" ou "Animée (gif)", importe le fichier. Une décoration animée
  s'affiche en cadre par-dessus la photo du joueur, gif compris. Clique sur
  une décoration existante dans la liste pour la modifier (renommer, changer
  le type, remplacer l'image).
- **Thèmes personnalisés** : donne un nom et choisis les couleurs (fond,
  cartes, accent, texte...) avec les sélecteurs de couleur — pas besoin de
  connaître de code. Comme les thèmes "Trophée" déjà existants, un thème
  personnalisé doit être attribué par toi à un joueur avant qu'il puisse le
  choisir.
- **Tags** : donne un nom et une couleur. Coche **"Disponible pour tout le
  monde dès la création du compte"** pour un tag que tous les joueurs
  peuvent utiliser sans que tu aies besoin de l'attribuer un par un ; laisse
  décoché pour un tag que tu réserves comme récompense.

Comme pour les décorations/thèmes déjà existants, l'attribution d'un tag ou
d'une décoration/thème verrouillé à un joueur précis se fait toujours depuis
**Paramètres > Voir le profil d'un joueur**, en cherchant son pseudo.

Un joueur peut afficher jusqu'à **5 tags en même temps** sur son profil
(section "Tags" de ses Paramètres), en cliquant pour les activer/désactiver
parmi ceux qu'il possède.

**Limite à connaître** : un joueur déjà connecté ne voit pas immédiatement
une décoration/un thème/un tag que tu viens de lui attribuer — il doit
rouvrir l'appli (ou se reconnecter) pour que ça apparaisse. C'est la même
logique que pour les décorations/thèmes des versions précédentes, juste
maintenant documentée clairement.

### Photo de profil : recadrage

Dans Paramètres > Photo de profil, après avoir choisi une image (ou cliqué
sur **"Recadrer la photo actuelle"** pour repositionner celle déjà
enregistrée), trois curseurs apparaissent : **Zoom**, **Position
horizontale** et **Position verticale**. Ajuste-les jusqu'à ce que l'aperçu
te convienne, puis "Enregistrer la photo".

### Liste des joueurs sur l'écran d'accueil

Une nouvelle section **Joueurs** liste tous les comptes créés, avec un
statut mis à jour en direct :
- 🟢 **Disponible** — le joueur est validé et présent dans le Duel du jour
  en cours.
- 🔴 **En combat** — le joueur est en duel accepté (Duel du jour), ou a un
  match en cours dans l'Événement en cours.
- ⚪ **Inactif** — tous les autres (pas dans une session en cours).

Chaque ligne a un bouton **"Voir le profil"**.

### Fiche profil en popup

Le bouton **"Voir profil"** (dans la liste des joueurs de l'accueil, comme
dans le Duel du jour) ouvre maintenant une **petite fenêtre directement sur
la page en cours** (avatar, pseudo, rôle, statistiques, tags) — plus besoin
de naviguer jusqu'à Paramètres pour un simple coup d'œil. Toi, l'organisateur,
tu vois en plus un lien **"Gérer ce joueur →"** dans cette fenêtre, qui
t'amène directement à sa fiche complète en Paramètres (attribution de
décorations/thèmes/tags).

## Ce qui n'est pas encore fait (prochaine étape)

- Le classement général basé sur l'historique des duels et des événements.
- Un vrai système de départage en cas d'égalité en fin d'événement.
- La gestion propre d'un abandon en cours d'événement.
- La suppression d'une décoration/d'un thème/d'un tag/d'un jeu une fois
  créé (pour l'instant, seule la création — et la modification pour les
  décorations/thèmes/tags — est possible — évite de laisser un joueur ou un
  match avec une référence vers quelque chose qui n'existe plus).
- La mise à jour en direct du profil d'un joueur déjà connecté quand
  l'organisateur lui attribue quelque chose (voir la limite ci-dessus).
