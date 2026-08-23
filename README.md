# Car'Tech Arena — v8.5

Cette version ajoute trois choses à la popup **"Voir le profil"** et à la
personnalisation : les **victoires/défaites de la saison en cours**
(en plus des points), un nouveau **fond de profil** personnalisable
(débloqué par l'organisateur, comme les décorations/thèmes), avec son
**gabarit téléchargeable**, et le **face-à-face** entre toi et la
personne dont tu regardes le profil (combien de fois vous vous êtes
affrontés, et qui a gagné). Les victoires s'affichent maintenant en
**vert** et les défaites en **rouge** partout où un total victoires/
défaites apparaît. Voir "Nouveau dans cette version — saison, fond de
profil et face-à-face sur 'Voir le profil'" plus bas pour le détail
complet.

**Republication des règles Firestore nécessaire pour cette version** —
nouvelle collection `profileBgs` (fonds de profil créés par
l'organisateur) et nouveau champ `profileBg` sur chaque compte joueur.
Voir "Mise à jour" ci-dessous : republie bien les fichiers ET les
règles cette fois-ci.

---

## Historique — v8.4

Cette version permettait à l'emoji personnalisé d'un tag (importé par
image, voir v8.3) d'être **animé** : importer un **gif animé** le
gardait tel quel, avec son animation, au lieu de le figer sur une seule
image. Voir "Nouveau dans cette version — emoji animé (gif)" plus bas
pour le détail complet.

## Historique — v8.3

Cette version ajoutait la possibilité de mettre, sur un tag, un **emoji
personnalisé importé depuis une image** (en plus de l'emoji texte déjà
existant) — avec un **gabarit téléchargeable** pour préparer l'image aux
bonnes proportions. Voir "Nouveau dans cette version — emoji personnalisé
par image" plus bas pour le détail complet.

## Historique — v8.2

Cette version ajoutait la possibilité de mettre un **emoji sur un tag**
de profil, et un vrai **indicatif de joueur** sur les fiches profil
(écran d'accueil, "Voir le profil", recherche organisateur) : des
**points, victoires et défaites calculés à vie** (depuis la création du
compte), affichés **avec** les points de la **saison en cours**. Voir
"Nouveau dans cette version — emoji sur les tags et indicatif de joueur à
vie" plus bas pour le détail complet.

## Historique — v8.1

Cette version ajoutait, directement dans le **Duel du jour**, un
**raccourci** vers "Saison actuelle", la possibilité de définir une
**condition pour gagner** (score à atteindre, ou points de vie de départ)
pour chaque jeu — y compris les jeux de base (Pokémon, Lorcana, One
Piece) — et une nouvelle statistique **"Points cumulés"** dans "Saison
actuelle", qui sert uniquement à départager deux joueurs à égalité de
points.

## Historique — v8

Cette version ajoutait un vrai **système de saisons** (points gagnés via
le Duel du jour, classement, tag automatique), confirmait que fermer une
session du Duel du jour **expulse maintenant tout le monde** (déjà
corrigé en v7.1 — vérifié à nouveau ici, rien de plus à faire), et
ajoutait une **barre de recherche** en haut de la liste des joueurs de
l'écran d'accueil. Voir "Nouveau dans cette version — Système de saisons"
plus bas pour le détail complet des règles (points, plafond, tag,
classement).

Elle nécessitait une republication des règles Firestore (nouvelle
collection `seasons`, et une règle très ciblée qui permet à un joueur de
s'attribuer lui-même le tag de la saison en cours après son premier match).

## Historique — v7.1

**Corrigeait un bug réel signalé après la v7** : un joueur marqué "disponible"
pouvait rester affiché **"Disponible" indéfiniment** sur l'écran d'accueil
de tout le monde — boutique fermée ou pas, déconnecté ou pas — si
l'organisateur fermait la session du Duel du jour pendant que ce joueur
était encore présent, sans que lui-même ait cliqué sur "Quitter le duel du
jour" avant. C'est exactement ce qui était arrivé sur le compte "Stooff_".
Voir "Corrigé dans cette version — statut 'Disponible' qui restait bloqué"
plus bas pour le détail. **Republie les règles ET les fichiers de cette
version pour que ça se corrige** (voir "Mise à jour" ci-dessous — le
correctif ne touche pas aux règles Firestore elles-mêmes, seulement au
code JS, mais republie les deux par sécurité comme d'habitude).

Cette version ajoute aussi la **suppression** d'une décoration/d'un thème/d'un
tag, un vrai flux **"non publié" → "Publier" → "Dépublier"** pour les
décorations (tu prépares une décoration tranquillement, elle n'est visible
que par toi, puis tu la rends visible pour tout le monde quand elle est
prête — sans qu'elle soit débloquée automatiquement pour autant), des
**gabarits téléchargeables** pour préparer une image de décoration ou de
fond de thème dans ton logiciel d'image préféré avec les bonnes
proportions dès le départ, et la possibilité d'ajouter une **image de
fond** à un thème personnalisé, en plus de ses couleurs.

Elle confirme aussi deux points que tu avais signalés et qui, après
vérification, fonctionnaient déjà correctement (voir plus bas pourquoi) :
le changement de mot de passe est bien accessible à tous les comptes (pas
seulement organisateur), et un joueur qui quitte le Duel du jour disparaît
bien de la liste "Disponible" sur l'écran d'accueil.

**Republication des règles Firestore obligatoire pour cette version**
(voir "Mise à jour" ci-dessous) : une décoration nouvellement créée n'est
désormais lisible que par toi tant qu'elle n'est pas publiée, et cette
garantie est appliquée aussi côté serveur (règles Firestore), pas
seulement dans l'affichage.

Elle inclut toujours tout ce qui a été ajouté dans les versions
précédentes : décorations de photo (statiques ou animées), thèmes de
couleurs, tags — tous créables et modifiables par toi directement depuis
l'appli — un recadrage de photo digne d'une vraie appli (zoom + position),
une **liste des joueurs** sur l'écran d'accueil qui montre en direct qui
est disponible en boutique, en duel, ou pas là, le Duel du jour,
l'Événement, l'Espace organisateur séparé des Paramètres standards, et
l'ajout d'un jeu (TCG) directement depuis l'appli.

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
js/home-players.js      <- liste des joueurs de l'écran d'accueil (+ recherche)
js/season.js            <- système de saisons (points, classement, tag)
firestore.rules         <- règles de sécurité à coller dans Firebase
```

Petite précision sur le stockage des photos : comme le plan gratuit Firebase
(Spark) ne permet plus d'utiliser "Cloud Storage" sans activer la
facturation, les photos de profil sont stockées directement dans Firestore,
sous forme d'image compressée (recadrée en 512×512 et convertie en JPEG
léger). Ça reste largement dans le 1 Go gratuit de Firestore et ça évite
d'avoir à activer un mode payant.

## Mise à jour depuis une version précédente — à faire une seule fois

1. **Republie les fichiers** : sur ton dépôt GitHub (le bon projet — celui
   lié à ton domaine `car-tech-arena.vercel.app`), remplace tous les
   fichiers par ceux de ce dossier (glisse-dépose tout par-dessus, "Commit
   changes"). `js/firebase-config.js` contient déjà tes vraies clés et ton
   email organisateur, pas besoin d'y retoucher.

2. **Republie les règles Firestore** (indispensable pour la v8.5 : nouvelle
   collection `profileBgs` et nouveau champ `profileBg` sur les comptes —
   voir plus haut ; pour une version qui ne change rien aux règles, autant
   quand même garder l'habitude de les republier à chaque fois, pour être
   sûr que tout reste synchronisé) : Firebase Console > Firestore Database
   > onglet "Règles" > remplace tout le contenu par celui de
   `firestore.rules` > "Publier". Vérifie bien qu'il n'y a **pas de
   message d'erreur en rouge** après avoir cliqué sur "Publier", et qu'un
   indicateur du style "Dernière publication : à l'instant" apparaît en
   haut — sinon les anciennes règles restent actives et rien ne change
   côté site, même si le code (JS/HTML) est à jour.

3. Vercel redéploiera automatiquement dès que GitHub reçoit les nouveaux
   fichiers.

C'est tout — pas de nouveau projet Firebase à créer, pas de nouvelle
autorisation à donner. Les comptes déjà créés continueront de fonctionner
normalement, et un compte bloqué (comme celui que tu as testé) se débloque
automatiquement à sa prochaine connexion (pas besoin de le recréer ni de
toucher à ses données à la main dans Firebase).

## Corrigé dans cette version — bug n°1 : décoration/thème qui refusait de s'activer

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

## Corrigé dans cette version — bug n°2 : la vraie cause du compte "Stooff_"

C'est ce deuxième bug, plus sournois, qui expliquait pourquoi le souci
persistait même après avoir republié les règles de la v6.

**La cause** : sur un compte créé avant l'ajout des Tags (ou plus
généralement, un compte qui n'a jamais reçu de tag de ta part), la première
fois que ce joueur active un tag "disponible pour tout le monde" tout seul
(sans que tu aies eu besoin de le lui donner), l'appli enregistre son choix
mais ne crée, par accident, qu'une moitié du champ "tags" du compte — la
partie "tags affichés" existe, mais la partie "tags possédés" n'est jamais
créée. Dans les règles de sécurité, vérifier cette partie manquante faisait
planter la vérification tout entière — et exactement comme pour le bug n°1,
ça bloquait alors TOUT le compte, y compris des actions qui n'ont rien à
voir avec les tags (activer une décoration, changer de thème...). C'est
exactement ce qui s'était passé sur le compte "Stooff_" que tu m'as montré :
il n'avait pas de souci de décoration/thème retiré comme le bug n°1, il
avait ce souci de tag à moitié enregistré.

**Le correctif** : les règles de sécurité savent maintenant gérer
proprement un champ "à moitié rempli" comme celui-ci sans planter, et
l'appli répare automatiquement les comptes concernés à leur prochaine
connexion (sans rien perdre : les tags déjà affichés par le joueur restent
affichés). Les nouveaux comptes créés à partir de cette version ne peuvent
plus se retrouver dans cet état.

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

## Corrigé dans cette version — statut "Disponible" qui restait bloqué

**Le souci (compte "Stooff_")** : un joueur marqué "disponible" pendant une
session de Duel du jour restait affiché **"🟢 Disponible" sur l'écran
d'accueil de tout le monde, pour toujours** — même la session fermée, même
le joueur reparti, même déconnecté — tant qu'il n'avait pas cliqué
lui-même sur "Quitter le duel du jour" **avant** la fermeture de la
session par l'organisateur. En pratique, personne n'y pense en fin de
soirée : la session se ferme avec des joueurs encore "disponibles", et
plus rien ne pouvait les faire redescendre en "Inactif" depuis l'écran
d'accueil — le bouton "Exclure" lui-même n'est visible que quand une
session est ouverte, donc impossible à utiliser après coup sans rouvrir
une session juste pour ça.

**Le correctif, à deux niveaux** :
1. Fermer la session repasse maintenant automatiquement tous les
   participants encore "disponibles" ou "en attente de validation" à
   "parti" — la fermeture d'une session nettoie vraiment tout, comme
   fermer la boutique pour la nuit.
2. Par sécurité (au cas où un statut resterait mal à jour pour une autre
   raison), l'écran d'accueil ne considère plus jamais quelqu'un comme
   "Disponible" à partir du Duel du jour si aucune session n'est **en ce
   moment même** ouverte — même si son ancien statut en base dit encore
   "disponible".

Un compte déjà coincé "Disponible" comme "Stooff_" se corrige tout seul
dès que cette version est en place, sans rien à faire sur son compte à la
main.

**Autre point vérifié en même temps, qui fonctionnait déjà correctement**
: le changement de mot de passe est bien accessible à **tout compte**
créé avec un email/mot de passe (organisateur ou joueur) dans Paramètres
— la section "Mot de passe" ne dépend que du mode de connexion utilisé,
pas du rôle ; elle est seulement masquée pour un compte connecté via
Google (pas de mot de passe à changer dans ce cas, géré par Google).

## Nouveau dans cette version — suppression d'une décoration/d'un thème/d'un tag

Dans l'écran **🛡️ Espace organisateur**, chaque décoration, thème ou tag
créé par toi affiche maintenant un bouton **"Supprimer"** (avec une
confirmation avant suppression définitive, impossible à annuler). Un
joueur qui avait cette décoration/ce thème/ce tag encore actif au moment
de la suppression ne voit rien casser côté affichage — l'appli ignore
simplement, sans erreur, une référence vers quelque chose qui n'existe
plus (exactement comme pour une décoration/un thème déjà retiré).
Les **jeux (TCG)** restent volontairement non supprimables, car déjà
référencés par l'historique des matchs et des événements passés.

## Nouveau dans cette version — publier / dépublier une décoration

Une décoration que tu viens de créer démarre maintenant **"Non publiée"**
: elle n'apparaît que dans l'Espace organisateur, le temps que tu la
prépares tranquillement (personne d'autre ne peut la voir, y compris en
passant par les outils développeur du navigateur — c'est vérifié côté
serveur, pas seulement dans l'affichage). Dans la liste de gestion, un
bouton **"Publier"** la rend visible pour tout le monde (verrouillée,
comme n'importe quelle décoration à débloquer) — publier **ne l'attribue
à personne automatiquement**, tu dois toujours l'attribuer joueur par
joueur depuis Paramètres > Voir le profil d'un joueur, comme avant. Un
bouton **"Dépublier"** permet de la faire disparaître à nouveau du
catalogue général si besoin.

## Nouveau dans cette version — gabarits téléchargeables

Pour préparer une image de décoration directement dans ton logiciel
d'image préféré (Photoshop, GIMP, Canva...) plutôt qu'à l'aveugle : le
formulaire de création de décoration a un bouton **"⬇️ Télécharger le
gabarit (1024×1024)"** qui te donne une image avec un carré en pointillés
montrant exactement où se trouve la photo de profil du joueur — dessine
ta décoration tout autour, exporte, puis importe le résultat. Le
formulaire de création de thème a de même un bouton **"⬇️ Télécharger le
gabarit (1080×1920)"** pour préparer une image de fond, avec un repère
indiquant la zone souvent recouverte par l'interface au centre de l'écran.

## Nouveau dans cette version — image de fond pour un thème personnalisé

En plus des couleurs, un thème personnalisé peut maintenant avoir une
**image de fond**. Dans le formulaire de création/modification d'un thème
(Espace organisateur), importe une image via le nouveau champ dédié — un
aperçu s'affiche immédiatement, avec un bouton pour la retirer si tu
changes d'avis. L'image est automatiquement compressée pour rester légère.

## Nouveau dans cette version — fermeture de session = tout le monde expulsé (rappel)

Tu as redemandé ce comportement — bonne nouvelle, il était déjà en place
depuis la v7.1 (voir "Historique — v7.1" plus haut) : fermer la session du
Duel du jour repasse automatiquement tout le monde à "parti", donc à la
prochaine session ouverte, chacun doit cliquer à nouveau sur "Demande à
rejoindre" pour être re-validé par toi. Rien à faire de plus ici, c'est
confirmé par un test automatisé dédié.

## Nouveau dans cette version — recherche dans la liste des joueurs

Un champ de recherche est apparu juste au-dessus de la liste **Joueurs**
sur l'écran d'accueil : tape une partie d'un pseudo pour filtrer la liste
en direct (insensible à la casse). Le filtre se combine avec le tri
habituel (disponible / en combat / inactif) — vide le champ pour
retrouver tout le monde.

## Nouveau dans cette version — Système de saisons

Un nouveau bouton **🏅 Saison actuelle** apparaît sur l'écran principal,
pour tout le monde.

### Programmer une saison (organisateur)

Dans l'écran **Saison**, un panneau tout en haut (visible seulement pour
toi) te permet de **programmer une saison** avec une date de début et une
date de fin — pas besoin de l'ouvrir/la fermer manuellement, elle démarre
et se termine toute seule à ces dates. Les saisons sont numérotées
automatiquement (Saison 1, Saison 2…) et tu peux en supprimer une si
besoin (bouton "Supprimer" dans la liste des saisons existantes).

### Ce qui se passe pendant une saison en cours

- **En haut de l'écran d'accueil**, un bandeau indique dans quelle saison
  on se trouve et ses dates de début/fin — **rien n'est affiché s'il n'y a
  pas de saison en cours**, comme demandé.
- **Les points ne se gagnent que via le Duel du jour** (pas l'Événement) :
  une **victoire rapporte 3 points**, une **défaite rapporte 1 point**, dès
  qu'un duel est validé (les deux résultats concordent).
- **Plafond de 15 points par journée** : passé ce plafond, le joueur peut
  toujours jouer autant de duels qu'il veut ce jour-là, mais ne gagne plus
  de points supplémentaires — en revanche, **son adversaire continue de
  gagner des points normalement**, même si lui a atteint son plafond. Le
  nombre de matchs/victoires/défaites affiché, lui, n'est jamais plafonné —
  seuls les points le sont.
- **Tag automatique** : dès qu'un joueur a joué (et terminé) au moins un
  duel pendant la saison en cours, il reçoit automatiquement un tag
  "Saison N" sur son profil (visible dans Paramètres &gt; Tags, à activer
  comme n'importe quel autre tag) — pas besoin que tu l'attribues
  toi-même.

### Le bouton "🏅 Saison actuelle"

Une fois dedans (que tu sois organisateur ou joueur), tu vois : tes points
de la saison actuelle, ton nombre de matchs, tes victoires, tes défaites,
et ta place actuelle au classement. En dessous, le **classement complet**
de tous les joueurs (même ceux qui n'ont pas encore joué, à 0 point),
trié du plus haut score au plus bas, avec **ta propre ligne surlignée**
pour la retrouver facilement — chaque ligne affiche la photo de profil du
joueur et un bouton **"Voir profil"**. Tout se met à jour en direct après
chaque combat validé.

### Comment les points sont calculés (transparence)

Comme pour le reste de l'appli, rien n'est "stocké" tel quel : le
classement d'une saison est **recalculé à chaque fois** à partir de
l'historique des duels du jour déjà validés, jamais à partir d'un
compteur qu'un client pourrait fausser en le modifiant directement — même
principe que les statistiques générales du profil (voir plus bas, "Ce qui
n'est pas encore fait"). **Seule exception, documentée et volontairement
très limitée** : le tag automatique de saison est ajouté par le joueur
lui-même (pas par toi), mais les règles Firestore vérifient strictement
que ça ne peut fonctionner que pour LE tag de la saison en cours, une
seule fois, sans jamais pouvoir toucher à un autre tag ou en retirer un —
testé et vérifié qu'un joueur ne peut pas s'en servir pour s'attribuer un
tag "récompense" normal.

## Nouveau dans cette version — condition de victoire par jeu et points cumulés

### Raccourci "Saison actuelle" depuis le Duel du jour

Un bouton **🏅** apparaît maintenant en haut de l'écran **Duel du jour**,
à côté du titre — il amène directement sur "Saison actuelle" sans avoir à
repasser par l'écran d'accueil.

### Condition pour gagner, par jeu

Dans **Espace organisateur > Jeux**, chaque jeu — y compris les 3 jeux de
base (Pokémon TCG, Lorcana, One Piece Card Game), pas seulement ceux que
tu crées toi-même — peut maintenant recevoir une **condition pour
gagner** facultative, avec deux types au choix :

- **Point maximal** : le nombre de points qu'il faut atteindre pour
  gagner la partie (ex. 20 points).
- **Point de défaite** : les points de vie de départ, pour un jeu où le
  but est d'éliminer l'adversaire (ex. 40 points de vie).

Clique sur "Définir une condition" (ou "Modifier la condition" si elle
est déjà réglée) sous le jeu concerné, choisis le type, indique la
valeur, "Enregistrer". Cette information est ensuite affichée aux
joueurs pendant le Duel du jour — dans le formulaire de proposition de
duel, et sur la carte du duel en cours — comme simple rappel, et sert
aussi de base au calcul des "points cumulés" ci-dessous.

C'est **entièrement facultatif** : un jeu sans condition définie continue
de fonctionner exactement comme avant, la seule différence est qu'il ne
contribue pas aux "points cumulés" (voir plus bas).

### Nouvelle statistique "Points cumulés" (départage de classement)

Dans **🏅 Saison actuelle**, une 5e statistique apparaît : **Points
cumulés**. Elle ne sert **qu'à départager deux joueurs à égalité de
points de saison** (les points classiques : victoire = 3, défaite = 1,
plafonnés à 15/jour) — plus précis que de les laisser à égalité pure —
et n'a aucun autre effet sur le jeu.

Le calcul, pour rester équitable entre des jeux qui n'ont pas la même
"condition pour gagner", ramène toujours la performance de CHAQUE joueur
sur une base de 100 par rapport à la condition configurée — mais la façon
de calculer cette performance dépend du type de condition du jeu joué :

- **Jeu en "Point maximal"** (course à un score) : c'est le score obtenu
  par le joueur lui-même dans ce duel. Exemple : 15 points sur un jeu où
  il en faut 20 pour gagner → 15 ÷ 20 × 100 = **75 points cumulés** pour
  ce match (qu'il ait gagné ou perdu ce duel précis — c'est le score
  obtenu qui compte, pas le résultat).
- **Jeu en "Point de défaite"** (points de vie de départ, élimination) :
  comme les points de vie qu'on saisit dans le formulaire de résultat
  sont ceux qui **restent** à chacun à la fin (0 pour celui qui est
  éliminé), le score obtenu ne peut pas servir tel quel — sinon le
  perdant, forcément à 0 point de vie restant, aurait toujours 0 point
  cumulé, même après un match très serré. Le calcul utilise donc plutôt
  les **dégâts infligés** par chaque joueur : (points de vie de départ −
  points de vie restants de l'ADVERSAIRE). Exemple concret (celui que tu
  m'as donné) : 50 points de vie de départ, un joueur meurt (0 restant),
  l'autre a 30 points de vie restants. Le gagnant a infligé 50 − 0 = 50
  dégâts sur 50 → **100 points cumulés**. Le perdant, lui, a quand même
  infligé 50 − 30 = 20 dégâts avant de mourir → **40 points cumulés** (pas
  0) — il garde le crédit d'avoir bien résisté, symétrique du cas "Point
  maximal" ci-dessus. Pour que ce calcul fonctionne, le formulaire de
  résultat du Duel du jour demande explicitement "tes points de vie
  restants" / "points de vie restants de l'adversaire" dès que le jeu
  joué est configuré en "Point de défaite".

Dans les deux cas : un jeu qui demande une valeur plus grande (ex. 40) ne
"pèse" pas plus lourd dans ce calcul qu'un jeu qui en demande moins (ex.
20), grâce à la mise à l'échelle sur 100. Un duel joué sur un jeu **sans
condition de victoire configurée** ne contribue à aucun point cumulé (ni
pour l'un ni pour l'autre joueur), et une performance qui dépasserait
100% (ex. un score supérieur à la condition) est plafonnée à 100 pour ce
match, pour ne pas avantager artificiellement un score disproportionné.

## Nouveau dans cette version — saison, fond de profil et face-à-face sur "Voir le profil"

### Victoires/défaites de la saison en cours

La popup **"Voir le profil"** (et la fiche de recherche organisateur)
affichait déjà les points de la saison en cours — elle affiche
maintenant aussi le nombre de **victoires et de défaites** de cette
saison, à côté des points : ex. « 4 pts — 1V / 1D — Saison 3 en cours ».

### Fond de profil personnalisé

Nouveau catalogue **"Fond de profil"**, débloqué par l'organisateur
exactement comme une décoration ou un thème (attribution individuelle
depuis la recherche de joueur, puis activation par le joueur dans
Paramètres > Personnalisation). Une fois activé, le fond choisi
s'affiche en arrière-plan, légèrement estompé, derrière la fiche profil
— sur l'écran d'accueil (ta propre fiche), dans la popup "Voir le
profil" et dans la fiche de recherche organisateur, partout de la même
façon.

Pour en créer un (Espace organisateur > Fonds de profil) : donne-lui un
nom, importe une image (recadrée/compressée automatiquement), ou
télécharge d'abord le **gabarit (1200×700)** pour composer l'image aux
bonnes proportions dans ton logiciel préféré. Comme les décorations, un
fond créé démarre "non publié" (visible seulement par toi le temps de le
préparer) — publie-le pour qu'il devienne attribuable à un joueur.

### Face-à-face entre toi et le joueur consulté

La popup "Voir le profil" (et la fiche de recherche organisateur)
affiche maintenant directement le **bilan des matchs entre toi et cette
personne** : combien de fois tu l'as battue, combien de fois elle t'a
battu, tous duels confondus depuis toujours (pas seulement la saison en
cours). S'il n'y a encore aucun match entre vous deux, un message
l'indique clairement plutôt que d'afficher "0V / 0D".

### Victoires en vert, défaites en rouge

Partout où un total victoires/défaites est affiché sur ces fiches
profil (total à vie, saison en cours, face-à-face), les victoires
s'affichent maintenant en vert et les défaites en rouge — plus rapide à
lire d'un coup d'œil qu'un simple texte "V / D".

## Nouveau dans cette version — emoji animé (gif)

L'emoji personnalisé par image (voir v8.3 ci-dessous) accepte maintenant
les **gifs animés** : en important un fichier `.gif`, l'organisateur
récupère son animation intacte sur le tag, partout où il s'affiche
(grille de personnalisation, liste de gestion, popup "Voir le profil",
recherche organisateur) — exactement comme les décorations animées déjà
proposées ailleurs dans l'appli.

### Comment ça marche

- **Gif animé** : gardé **tel quel** (aucun recadrage ni recompression,
  qui figerait l'animation sur une seule image) — juste plafonné à
  **300 Ko environ**. Si le fichier dépasse cette taille, un message
  demande d'en choisir un plus léger.
- **Image fixe** (JPEG, PNG, WebP...) : comportement inchangé depuis la
  v8.3 — recadrée automatiquement en carré puis compressée.

La détection est automatique (selon le type du fichier importé) : pas de
case à cocher ni de choix à faire, il suffit d'importer un gif pour que
l'emoji devienne animé. Le gabarit téléchargeable (512×512, zone visible
en cercle) reste valable pour composer un gif animé — la zone hors du
cercle sera simplement invisible à l'affichage, comme pour une image
fixe.

## Nouveau dans cette version — emoji personnalisé par image

Dans **Espace organisateur > Tags**, en plus du champ "Emoji" (texte)
déjà existant, un nouveau champ facultatif permet d'**importer une
image** comme emoji du tag — utile pour un logo de jeu, un blason de
club, ou tout visuel qui n'existe pas comme emoji classique.

### Comment ça marche

1. Un bouton **"⬇️ Télécharger le gabarit (512×512)"** télécharge une
   image de départ (carrée, fond en damier = transparence) avec un
   **cercle en pointillés** qui marque la zone réellement visible :
   l'icône s'affiche toute petite et **ronde** partout dans l'appli
   (~14 px), donc tout ce qui dépasse le cercle (les coins de l'image)
   ne sera jamais visible. Ouvre ce gabarit dans ton logiciel d'image
   (Photoshop, GIMP, Canva...), dessine ton visuel à l'intérieur du
   cercle, exporte en PNG (fond transparent conseillé), puis reviens
   l'importer.
2. Dans le formulaire de tag, le champ **"Ou un emoji personnalisé
   importé par image"** accepte n'importe quelle image (elle n'a pas
   besoin d'être déjà carrée : elle est **recadrée automatiquement au
   centre en carré**, puis compressée). Un aperçu rond s'affiche
   immédiatement, avec un bouton "Retirer l'image" pour annuler.
3. **L'image, si elle est définie, prend toujours le pas sur l'emoji
   texte** à l'affichage — mais l'emoji texte n'est jamais effacé pour
   autant : retirer l'image (bouton "Retirer l'image" puis
   enregistrer) fait immédiatement retomber l'affichage sur l'emoji
   texte s'il y en a un, ou sur rien du tout sinon.

L'emoji image apparaît exactement aux mêmes endroits que l'emoji texte :
la grille de personnalisation d'un joueur, la liste de gestion
organisateur, les pastilles sur une fiche profil ("Voir le profil",
recherche organisateur).

## Nouveau dans cette version — emoji sur les tags et indicatif de joueur à vie

### Emoji sur un tag

Dans **Espace organisateur > Tags**, un nouveau champ facultatif "Emoji"
permet d'ajouter un emoji (ex. 🏆, 🎖️, 🔥) devant le nom d'un tag. Il
apparaît partout où le tag est affiché : la grille de personnalisation
d'un joueur, la liste de gestion organisateur, les pastilles sur une
fiche profil ("Voir le profil", recherche organisateur). Un tag déjà créé
peut recevoir un emoji après coup en le modifiant (bouton "Modifier").
Laisser le champ vide garde le comportement d'avant (juste le nom).

### Indicatif de joueur : points/victoires/défaites à vie

Sur l'écran d'accueil, ta propre fiche affiche maintenant 4 statistiques
au lieu de 3 : **Points (total)**, **Victoires**, **Défaites**, et
**Saison actuelle**. Elles apparaissent aussi sur la fiche de n'importe
quel joueur (popup "Voir le profil", recherche organisateur), pas
seulement la tienne — c'est pensé comme un indicatif global d'activité
et de niveau, comme tu l'as demandé.

Le calcul, précisément :

- **Points (total)** = la somme des points gagnés sur **toutes les
  saisons**, passées et actuelle, depuis la création du compte — avec
  exactement les mêmes règles qu'à l'intérieur de l'écran "Saison
  actuelle" (victoire = 3 pts, défaite = 1 pt, plafonné à 15 pts par
  journée). Un duel joué à un moment où **aucune saison n'était en
  cours** ne rapporte donc aucun point ici non plus — les points restent
  toujours liés à une saison, seulement additionnés sur toute la
  carrière du compte au lieu de la seule saison actuelle.
- **Victoires / Défaites** = **tous** les duels du jour terminés depuis
  la création du compte, qu'une saison ait été en cours ou non à ce
  moment-là. Volontairement plus large que les points : ça donne une
  vraie idée de l'activité du joueur même sur les périodes sans saison
  programmée.
- **Saison actuelle** = juste le sous-total de points de la saison
  actuellement active (si il y en a une) — un raccourci pour ne pas
  avoir à ouvrir l'écran "Saison actuelle" pour ce seul chiffre. Affiche
  un tiret (—) s'il n'y a pas de saison en cours.

**Point d'attention sur le calcul "Points (total)"** : comme il se base
uniquement sur la DATE calendaire de chaque duel (pas sur le fait qu'une
saison existait déjà au moment précis où le duel a été joué), un duel
joué le jour même où une saison démarre (avant ou après sa création dans
l'après-midi, par exemple) compte pour cette saison — c'est cohérent
avec le fonctionnement déjà en place pour "Saison actuelle" (pas un
comportement nouveau introduit ici).

Comme pour le reste de l'appli : rien n'est stocké, tout est recalculé en
direct à partir de l'historique des duels — les anciens champs
`points`/`victoires`/`défaites` du compte (toujours à 0, jamais mis à
jour) ne sont plus utilisés pour l'affichage.

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

- Un classement général "toutes saisons confondues" (le système de saisons
  couvre un classement PAR saison programmée, basé uniquement sur le Duel
  du jour — pas encore un classement all-time incluant aussi l'Événement).
- Un vrai système de départage en cas d'égalité en fin d'événement.
- La gestion propre d'un abandon en cours d'événement.
- La suppression d'un jeu (TCG) une fois créé — volontairement non permise,
  car déjà référencé par l'historique des matchs et des événements passés.
- La mise à jour en direct du profil d'un joueur déjà connecté quand
  l'organisateur lui attribue quelque chose (voir la limite ci-dessus).
