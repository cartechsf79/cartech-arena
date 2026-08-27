# Car'Tech Arena — v15

Cette version ajoute 4 améliorations demandées :

- **Toi (organisateur) voit maintenant tous les titres de succès** :
  dans ton propre sélecteur de titre (Réglages), tu vois désormais
  **tous** les titres de succès existants, même ceux que tu n'as
  jamais débloqués toi-même — pratique pour les essayer/les afficher
  sans avoir à te les attribuer artificiellement. Ça ne change rien
  pour les joueurs normaux : eux continuent de ne voir que les titres
  qu'ils ont réellement gagnés.
- **Calendrier — bouton "intéressé(e)" retiré le jour J** : une fois
  qu'une annonce du calendrier arrive à sa date (aujourd'hui), le
  bouton "🙋 Je suis intéressé(e)" disparaît — plus la peine de
  s'inscrire une fois qu'on est sur la case de l'événement. La liste
  des joueurs déjà intéressés reste visible et consultable normalement.
- **Nouveau titre exclusif "Organisateur"** : un titre spécial nommé
  **"Organisateur"** est maintenant disponible uniquement dans ton
  propre sélecteur de titre (Réglages) — toi seul peux te l'attribuer,
  il n'apparaît jamais dans le catalogue de titres à publier, ni dans
  la liste des titres que tu peux donner à un autre joueur.
- **Logo de l'application personnalisable** : une nouvelle section
  **"⚔️ Logo de l'application"** dans l'Espace organisateur (🛡️) te
  permet d'importer ta propre image pour remplacer l'épée ⚔️ par
  défaut — avec gabarit téléchargeable, comme d'habitude. **Le logo se
  met à jour automatiquement chez tout le monde**, y compris chez les
  joueurs déjà connectés (pas besoin de recharger la page ni de se
  reconnecter). Deux limites techniques à connaître, voir le détail
  juste en dessous.

**⚠️ Cette version nécessite de republier les règles Firestore** —
contrairement à la v14, le nouveau logo personnalisable ajoute un tout
petit nouvel espace de stockage (`appSettings`) au règlement de
sécurité, donc **il faut republier `firestore.rules`** (Firebase
Console → Firestore Database → Règles → copier-coller le contenu du
fichier `firestore.rules` fourni → Publier) avant que le bouton
"Appliquer ce logo" fonctionne. Les 3 autres changements ci-dessus,
eux, ne demandent rien de plus sur Firebase.

**Les 2 limites techniques du nouveau logo :**

- **L'écran de connexion (avant de se connecter) garde toujours
  l'épée ⚔️ par défaut.** Ce n'est pas un oubli : toute lecture dans
  Firestore nécessite d'être déjà connecté (c'est comme ça pour toute
  l'appli, pour la sécurité), donc l'écran affiché avant la connexion
  ne peut techniquement pas aller chercher ton logo personnalisé.
  Seul l'écran affiché une fois connecté se met à jour.
- **L'icône d'installation sur l'écran d'accueil du téléphone (PWA,
  voir plus bas) ne peut pas être changée à distance.** Cette icône est
  "figée" au moment où quelqu'un installe l'appli sur son téléphone —
  changer le logo dans l'appli ne la met pas à jour rétroactivement
  pour les personnes qui l'ont déjà installée (seules les nouvelles
  installations après un futur redéploiement du site verraient une
  icône mise à jour). C'est une limitation des téléphones/navigateurs,
  pas de Car'Tech Arena.

---

## Historique — v14

Cette version corrigeait un détail du système de succès (v13) et
ajoutait 3 petites améliorations :

- **Corrigé — dernier palier = titre, jamais tag en plus** : le dernier
  palier de chaque famille de succès ne donne (et n'a jamais dû donner)
  **que le titre**, pas un tag en plus. Si des comptes ont déjà reçu un
  tag de dernier palier par erreur avant ce correctif, il ne se
  retirera pas tout seul (l'appli n'attribue jamais deux fois le même
  tag, mais ne retire rien non plus) — sans conséquence pratique, un
  tag en trop dans le picker d'un joueur.
- **Réglages — tags séparés en deux sections** : dans le picker de tag
  du joueur (Réglages), les **"🏷️ Tags à gagner"** (créés par toi) et
  les **"🏆 Tags de succès"** (gagnés automatiquement) apparaissent
  maintenant dans deux groupes distincts, pour que ce soit plus clair.
- **Calendrier — titre visible dans la liste des intéressés** : à côté
  du pseudo de chaque joueur intéressé par une session à venir, son
  titre actif (s'il en a un) s'affiche maintenant, comme partout
  ailleurs dans l'appli.
- **Installation en PWA** : une nouvelle section **"📱 Application"**
  dans les Réglages permet d'installer Car'Tech Arena comme une icône
  sur l'écran d'accueil du téléphone (ou de l'ordinateur), pour l'ouvrir
  en un tap sans passer par le navigateur. Voir "Nouveau dans cette
  version — Installation en PWA" tout en bas pour le détail (dont la
  différence Android/iPhone).

Aucune republication des règles Firestore n'était nécessaire pour la
v14.

---

## Historique — v13

Cette version ajoutait le **système de succès (achievements)** :

- **24 familles de succès** — reprenant à la fois tes toutes premières
  idées (Duels joués, Victoires d'affilée, Participation aux
  Événements, Duels Lorcana, Duels Pokémon, Perfects, Comeback à 1
  point de vie, Score max Duel du jour) et les 16 autres imaginées
  ensemble après (Assiduité, Polyvalent, Parrain en série,
  Collectionneur, Fidèle à un deck, Rival, Rivalité, Points à vie,
  Ancien de la maison, Champion de tournoi, Sur le podium, Come-back
  kid, David contre Goliath, La poisse, Champion de saison, Platine),
  avec 1, 3, 4 ou 5 paliers chacune.
- **Tags et titre attribués automatiquement** : dès qu'un joueur
  remplit la condition d'un palier, le **tag correspondant tombe tout
  seul** (comme le tag de saison ou la récompense de parrainage) — pas
  besoin que tu valides quoi que ce soit. Le **dernier palier** de
  chaque famille donne, lui, un **titre** (pas de tag à ce palier-là).
- **Nouveau bouton "🏆 Succès"** sur l'écran d'accueil : ouvre un écran
  listant les 24 succès, avec pour chacun une **barre de progression
  visible** vers le prochain palier (et "Complété !" une fois le
  dernier palier atteint).

Voir la section "Nouveau dans cette version — Système de succès" tout
en bas pour le détail complet (dont les quelques succès qui reposent
sur une approximation, faute de donnée exacte disponible).

**Republication des règles Firestore NÉCESSAIRE pour la v13**
(nouvelles fonctions d'auto-attribution pour les tags ET pour les
titres de succès) — voir "Mise à jour depuis une version précédente"
plus bas.

---

## Historique — v12

Cette version ajoutait **2 grandes fonctionnalités** :

- **Calendrier et Événement complètement indépendants** : le Calendrier
  n'est plus du tout lié aux vrais Événements (tournois joués sur
  place) — c'est maintenant une simple liste d'annonces "jeu + date"
  sans aucune inscription ni validation : n'importe qui peut cliquer
  **"🙋 Je suis intéressé(e)"** pour dire qu'il compte venir, librement
  et sans que tu aies quoi que ce soit à valider. Un vrai Événement, de
  son côté, se joue **maintenant** — il ne te demande plus de date à la
  création.
- **Tournoi par élimination directe** : en plus du tournoi à la suisse
  existant, tu peux maintenant créer un Événement en **mode
  élimination directe** (bracket classique, avec byes si le nombre de
  joueurs n'est pas une puissance de 2). Un nouvel **arbre visuel du
  tournoi** s'affiche sur l'écran d'affichage, avec la photo de profil
  et la décoration de chaque joueur à côté de son pseudo, les joueurs
  éliminés barrés, et le chronomètre de la manche en cours.

**Republication des règles Firestore nécessaire pour cette version**
(nouvelle collection `calendarAnnouncements`).

---

## Historique — v11

Cette version ajoutait **3 fonctionnalités** :

- **Écran d'affichage repensé pour un vrai second écran** : tout le
  texte est agrandi et le **chronomètre de manche est bien plus gros**
  (pensé pour être lu de loin, sur une télé au fond de la boutique). Le
  bouton "📺 Écran d'affichage" ouvre maintenant cet écran dans un
  **nouvel onglet du navigateur** plutôt que dans l'appli elle-même —
  et il n'y a volontairement **plus aucun bouton pour le fermer** :
  c'est un écran "juste les infos", en continu, que tu fermes toi-même
  en fermant l'onglet quand tu en as besoin.
- **Calendrier des tournois** *(remplacé en v12 par un calendrier
  totalement indépendant des Événements — voir plus haut)* : un nouveau
  bouton **"📅 Calendrier"**, visible par tout le monde depuis
  l'accueil, qui affichait tous les tournois programmés dans une vraie
  **vue mensuelle** (case par jour, comme un calendrier classique) —
  pas seulement le tournoi du moment. En cliquant sur un tournoi, un
  joueur pouvait s'y **inscrire à l'avance** ("🙋 Je participe") même si
  ce n'était pas encore le tournoi en cours, et voir combien de joueurs
  étaient déjà inscrits (bouton "[N] inscrits", qui dépliait la liste
  complète au clic).
- **Points de saison depuis les Événements** : si une saison est en
  cours, les points gagnés pendant un Événement (tournoi) comptent
  maintenant dans le classement de la saison — **exactement les mêmes
  règles que le Duel du jour** (victoire = 3 pts, défaite = 1 pt,
  plafond quotidien de 15 pts, cumulé duel + événement le même jour).
  Avant cette version, seul le Duel du jour rapportait des points de
  saison.

Voir les 3 sections "Nouveau dans cette version" plus bas pour le détail
complet de chacune.

**Aucune republication des règles Firestore n'était nécessaire pour la
v11** (uniquement des changements de code JS/HTML/CSS).

---

## Historique — v10

Cette version ajoutait **3 fonctionnalités** :

- **Mode spectateur** : un nouvel écran, accessible à tout compte
  connecté (joueur ou organisateur), qui affiche uniquement les
  **résultats** — du Duel du jour comme d'un Événement — sans jamais
  montrer les decks pendant que ça joue, seulement une fois le
  combat/événement terminé. Ne montre que l'activité du **jour même** :
  dès qu'il n'y a plus rien à voir sur la journée, l'écran se vide de
  lui-même ("rien à voir pour l'instant").
- **Système de parrainage** : un joueur peut indiquer, une seule fois à
  l'inscription, le pseudo du joueur qui l'a parrainé. Une fois que le
  filleul a joué (et terminé, gagné ou perdu peu importe) son tout
  premier Duel du jour, les **deux comptes** reçoivent automatiquement
  un tag récompense (ex. "The Godfather") que tu marques comme tel en le
  créant dans Espace organisateur > Tags. Un compteur "combien de
  joueurs j'ai parrainés" est aussi visible dans Réglages, pour de
  futures récompenses.
- **Écran d'affichage organisateur** : un nouvel écran, réservé à
  l'organisateur, pensé pour être ouvert sur un second écran/une télé
  en boutique que tout le monde peut suivre en direct : chronomètre de
  la manche en cours d'un événement, placement provisoire des joueurs,
  score final avec les decks utilisés une fois l'événement terminé, et
  classement du jour du Duel du jour (points gagnés aujourd'hui
  uniquement — remis à zéro chaque nouveau jour). D'autres blocs
  pourront s'y ajouter facilement par la suite.

  À ce sujet : le chronomètre d'une manche d'événement était **déjà**
  lancé uniquement par l'organisateur et déjà synchronisé pour tout le
  monde (chaque joueur voit le même compte à rebours, basé sur l'heure
  de lancement enregistrée côté serveur) — aucun changement de code
  n'était nécessaire sur ce point précis, seul le nouvel écran
  d'affichage ci-dessus est vraiment nouveau.

Cette version nécessitait une republication des règles Firestore
(nouveaux champs protégés `referral.referredByUid` / `referral.rewardGranted`
sur le profil joueur, et une nouvelle règle qui autorise — de façon très
encadrée — qu'un filleul déclenche automatiquement l'ajout du tag
récompense sur le compte de son parrain).

---

## Historique — v9

Cette version ajoutait **4 fonctionnalités** demandées pour mieux piloter
la boutique, pas juste le jeu :

- **Calendrier des événements à venir** : l'organisateur peut programmer
  plusieurs événements à l'avance (chacun avec sa date) au lieu d'un
  seul à la fois — un seul est jamais réellement "en cours" (inscriptions
  ouvertes puis manches lancées), les autres restent visibles pour tout
  le monde dans un calendrier en lecture seule, pour que les joueurs
  s'organisent à l'avance au lieu de découvrir un événement le jour même.
- **Titre personnalisé** : un titre texte (ex. "Champion de la saison 2")
  affiché sous le pseudo, débloqué comme récompense par l'organisateur —
  même fonctionnement que les décorations/fonds de profil (catalogue à
  créer/publier, puis à attribuer joueur par joueur).
- **Tableau de bord organisateur** : un nouvel écran (visible seulement
  par l'organisateur) avec les indicateurs boutique sur les 30 derniers
  jours — joueurs actifs par semaine, jeu le plus populaire, joueurs
  "réguliers" (revenus plusieurs jours différents).
- **Points bonus manuels** : l'organisateur peut créditer (ou retirer)
  des points à un joueur en dehors d'un duel, depuis sa fiche ("Voir le
  profil d'un joueur" > Paramètres) — comptent dans son total à vie, et
  dans le total de la saison en cours si une saison est active au moment
  où le bonus est accordé.

Voir les 4 sections "Nouveau dans cette version" plus bas pour le détail
complet de chacune.

**Republication des règles Firestore nécessaire pour cette version**
(nouvelle collection `titles`, nouveaux champs protégés sur le profil
joueur pour le titre actif/possédé, nouvelle collection
`pointAdjustments`) — voir "Mise à jour depuis une version précédente"
plus bas.

## Historique — v8.9

Cette version ajoutait le **suivi par deck/archétype** : en plus du
score, un joueur pouvait déclarer **quel deck il a joué** pour un duel
(Duel du jour) ou un événement — via des **éléments** (couleurs/types de
deck, ex. les couleurs d'encre à Lorcana) configurés jeu par jeu dans
**Espace organisateur > Jeux**. Le deck déclaré restait **caché à
l'adversaire** jusqu'à la fin du duel/événement, une règle appliquée
côté serveur.

Republication des règles Firestore nécessaire pour cette version (deux
nouvelles collections protégées : `decks` sous chaque duel, `deck` sous
chaque participant d'événement).

## Historique — v8.8

Cette version réorganisait l'**Espace organisateur** : les 5 catégories
(décorations, fonds de profil, thèmes, tags, jeux) étaient toutes
regroupées dans une seule grande carte qui s'enchaînait sans séparation
claire — chacune a maintenant **sa propre bulle bien distincte**
(comme la carte "Joueurs" de l'écran d'accueil), avec son titre, sa
liste et son formulaire de création, pour que ce soit plus lisible et
plus facile à s'y retrouver.

Pas de republication des règles Firestore n'était nécessaire pour cette
version.

## Historique — v8.7

Cette version corrigeait le **gabarit téléchargeable du fond de
profil** (Espace organisateur > Fonds de profil) : il était en format
paysage (1200×700, plus large que haut), alors que le fond s'affiche en
réalité derrière des zones plutôt **hautes** (toute la fiche d'accueil,
toute la popup "Voir le profil" depuis la v8.6) — une image préparée
avec l'ancien gabarit se retrouvait donc mal cadrée. Le nouveau gabarit
est en **900×1200 (portrait)**, avec un rappel que la zone exactement
visible varie un peu selon l'écran (accueil / popup / recherche), donc
à garder l'essentiel de l'image bien centré.

## Historique — v8.6

Cette version ajoutait deux améliorations demandées après la v8.5.
D'abord, le compte **organisateur avait toutes les décorations, tous les
thèmes, tous les tags et tous les fonds de profil débloqués d'office** —
pour pouvoir tout essayer directement sur son propre profil sans devoir
d'abord se les attribuer via la recherche organisateur (les comptes
joueurs ne sont pas concernés : ils doivent toujours recevoir chaque
élément normalement). Ensuite, le **fond de profil s'affichait sur toute
la zone du profil** — dans la popup "Voir le profil", ça couvrait le
titre, la carte ET le bouton "Gérer ce joueur", pas seulement une petite
carte à l'intérieur ; pareil dans la fiche de recherche organisateur.
Voir "Nouveau dans cette version — organisateur tout débloqué & fond de
profil sur toute la fenêtre" plus bas pour le détail complet.

Pas de republication des règles Firestore n'était nécessaire pour cette
version.

## Historique — v8.5

Cette version ajoutait trois choses à la popup **"Voir le profil"** et à
la personnalisation : les **victoires/défaites de la saison en cours**
(en plus des points), un nouveau **fond de profil** personnalisable
(débloqué par l'organisateur, comme les décorations/thèmes), avec son
**gabarit téléchargeable**, et le **face-à-face** entre toi et la
personne dont tu regardes le profil (combien de fois vous vous êtes
affrontés, et qui a gagné). Les victoires s'affichent en **vert** et les
défaites en **rouge** partout où un total victoires/défaites apparaît.
Voir "Nouveau dans cette version — saison, fond de profil et face-à-face
sur 'Voir le profil'" plus bas pour le détail complet.

Elle nécessitait une republication des règles Firestore (nouvelle
collection `profileBgs`, nouveau champ `profileBg` sur chaque compte).

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

2. **Republie les règles Firestore** — **obligatoire pour la v13**
   (nouvelles fonctions qui autorisent un joueur à s'attribuer lui-même
   un tag ET, pour la première fois, un titre de succès — voir "Nouveau
   dans cette version — Système de succès" plus bas) :
   Firebase Console > Firestore Database > onglet "Règles"
   > sélectionne TOUT le contenu déjà présent et supprime-le d'abord >
   colle tout le contenu de `firestore.rules` (vérifie qu'il commence par
   `rules_version = '2';` et finit par une accolade `}` seule sur la
   dernière ligne) > "Publier". Vérifie bien qu'il n'y a **pas de message
   d'erreur en rouge** après avoir cliqué sur "Publier", et qu'un
   indicateur du style "Dernière publication : à l'instant" apparaît en
   haut — sinon les anciennes règles restent actives et rien ne change
   côté site, même si le code (JS/HTML) est à jour (c'est ce genre de
   collage incomplet qui a causé le souci "fond de profil invisible"
   juste après la v8.5).

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

## Nouveau dans cette version — calendrier des événements à venir

L'organisateur peut maintenant **programmer plusieurs événements à
l'avance**, chacun avec sa **date prévue** — plus besoin de créer un
événement le jour même. Depuis Événement > Organisateur, le formulaire
"Programmer un événement" reste toujours disponible (même pendant qu'un
autre événement est déjà en préparation ou en cours) : jeu, format, date
et temps par manche.

À tout moment, **un seul événement est réellement "actif"** (celui sur
lequel portent les inscriptions puis les manches) — c'est automatiquement
celui déjà en cours, ou sinon celui dont la **date prévue est la plus
proche** parmi ceux encore programmés. Tous les autres événements
programmés apparaissent, pour **tout le monde** (organisateur et
joueurs), dans un nouveau **calendrier "événements à venir"** en bas de
l'écran Événement — une simple liste triée par date, pour que les
joueurs voient ce qui arrive et s'organisent en avance. L'organisateur
peut supprimer un événement encore purement programmé (pas encore
démarré) directement depuis ce calendrier, s'il change d'avis sur une
date ou un jeu.

## Nouveau dans cette version — titre personnalisé

En plus des tags, un joueur peut maintenant afficher un **titre**
(un texte court, ex. "Champion de la saison 2") juste sous son pseudo —
partout où son profil apparaît (accueil, popup "Voir le profil",
recherche organisateur). Fonctionne exactement comme les
décorations/fonds de profil : toi, l'organisateur, crées des titres dans
**Espace organisateur > Titres** (nom seulement, pas d'image), les
publies quand ils sont prêts, puis les **attribues** joueur par joueur
depuis "Voir le profil d'un joueur" > Paramètres. Le joueur choisit
ensuite, parmi les titres qui lui ont été attribués, lequel afficher (ou
aucun) depuis Paramètres > Titre.

## Nouveau dans cette version — tableau de bord organisateur

Un nouvel écran **"📊 Tableau de bord"** (visible uniquement par toi,
depuis Espace organisateur) donne une vue d'ensemble de l'activité de la
boutique sur les **30 derniers jours** (fenêtre glissante, pas un mois
civil) :

- **Joueurs actifs par semaine** : le nombre de joueurs distincts ayant
  joué au moins un duel, semaine par semaine sur la période.
- **Jeu le plus populaire** : les jeux classés par nombre de duels joués.
- **Joueurs réguliers** : ceux ayant joué au moins un duel sur 3 jours
  différents ou plus (pas juste beaucoup de duels un seul soir) — pour
  repérer qui revient vraiment en boutique.

Ces indicateurs se basent sur l'activité du **Duel du jour** (pas encore
sur l'Événement — voir "Ce qui n'est pas encore fait").

## Nouveau dans cette version — points bonus manuels

Tu peux maintenant créditer (ou retirer, avec un nombre négatif) des
**points en dehors d'un duel** à un joueur précis — par exemple pour une
participation à un événement spécial ou un geste commercial. Ça se fait
depuis Paramètres > "Voir le profil d'un joueur" > recherche le joueur,
tout en bas de sa fiche : indique le nombre de points et une raison
(optionnelle), "Ajouter le bonus". L'historique des bonus déjà accordés
à ce joueur s'affiche juste au-dessus, avec un bouton pour en supprimer
un en cas d'erreur.

Un bonus compte **toujours** dans le total à vie du joueur, et compte
**aussi** dans le total de la saison en cours **si une saison est
active au moment où tu l'accordes** (comme les points gagnés par un
duel, mais sans le plafond de 15 points/jour, qui ne s'applique qu'aux
duels).

## Nouveau dans cette version — suivi par deck/archétype (éléments de jeu)

### Configurer les éléments d'un jeu

Dans **Espace organisateur > Jeux**, clique sur **"Paramètres du jeu"**
sous n'importe quel jeu (y compris les 3 jeux de base : Pokémon TCG,
Lorcana, One Piece Card Game) : en plus de la condition de victoire déjà
existante, une nouvelle section **"🧩 Éléments"** apparaît tout en bas.
Donne un nom à chaque élément (ex. les couleurs d'encre à Lorcana : Ambre,
Améthyste...) et une petite icône (image), avec un **gabarit
téléchargeable (512×512)** pour bien la préparer. Un élément ajouté
apparaît immédiatement dans la liste, avec un bouton "Retirer".

C'est **entièrement facultatif, jeu par jeu** : tant qu'aucun élément
n'est configuré pour un jeu, rien ne change pour les joueurs de ce jeu.
Dès qu'**au moins un élément** est configuré, en revanche, déclarer son
deck devient **obligatoire** pour jouer à ce jeu (voir ci-dessous) — ça
bloque la proposition/acceptation d'un duel ou l'inscription à un
événement tant que ce n'est pas fait.

### Déclarer son deck — Duel du jour

Si le jeu choisi a des éléments configurés, un sélecteur apparaît dans le
formulaire de proposition de duel (**et** dans la carte d'acceptation
côté adversaire) : coche **un ou plusieurs** éléments (ex. un deck 2
couleurs) pour représenter ton deck. **Les deux joueurs** doivent
déclarer leur deck — celui qui propose ET celui qui accepte — sinon
impossible d'envoyer la proposition / de l'accepter.

### Déclarer son deck — Événement

Même principe au moment de rejoindre un événement (bouton "Événement
disponible") : si le jeu a des éléments configurés, un sélecteur
apparaît avant de pouvoir confirmer l'inscription.

### Caché jusqu'à la fin (anti-triche)

Le deck déclaré par chacun reste **invisible à l'adversaire** tant que
le duel n'est pas **terminé** (ou l'événement, pour un deck déclaré à
l'inscription) — impossible de "scouter" le deck de l'adversaire à
l'avance pour préparer un contre. Cette règle est appliquée **côté
serveur** dans les règles Firestore (pas seulement cachée à l'affichage
côté appli) : même en contournant l'interface, un joueur ne peut
techniquement pas lire le deck d'un adversaire avant la fin. Une fois le
duel terminé, une carte récapitulative apparaît automatiquement des deux
côtés avec les deux decks révélés (et le résultat) ; pour un événement,
les decks de tous les participants classés apparaissent dans
**l'historique des événements** à côté du classement final.

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

## Corrigé dans cette version — gabarit du fond de profil (portrait)

Le gabarit téléchargeable pour le fond de profil (Espace organisateur >
Fonds de profil > "Télécharger le gabarit") était en 1200×700 (paysage),
alors que le fond s'affiche derrière des zones plutôt hautes que larges
(la fiche d'accueil, la popup "Voir le profil" en entier depuis la
v8.6) : une image préparée avec l'ancien gabarit finissait mal cadrée
(rognée sur les côtés). Le gabarit est maintenant en **900×1200
(portrait)**. Comme le fond de profil s'affiche à trois endroits qui
n'ont pas exactement la même forme (accueil, popup, recherche
organisateur), le gabarit ne peut pas être parfaitement exact partout —
le nouveau gabarit le rappelle directement dessus, et conseille de
garder l'essentiel de l'image bien centré, avec de la marge tout
autour, pour que ça reste correct où que ce soit affiché.

Si tu avais déjà créé un fond de profil avec l'ancien gabarit (paysage),
rien ne casse : il reste utilisable tel quel, juste peut-être moins bien
cadré. Tu peux le remplacer (bouton "Modifier" dans la liste de gestion)
avec une nouvelle image préparée sur le nouveau gabarit si tu veux
l'améliorer.

## Nouveau dans cette version — organisateur tout débloqué & fond de profil sur toute la fenêtre

### L'organisateur a tout débloqué d'office

Sur ton propre compte organisateur, dans Paramètres > Personnalisation,
**toutes les décorations, tous les thèmes (y compris les thèmes
"Trophée" normalement réservés) et tous les fonds de profil créés
apparaissent maintenant débloqués**, même si tu ne te les es jamais
attribués via la recherche organisateur — pareil pour les tags : tous
ceux créés dans le catalogue te sont utilisables. Objectif : pouvoir
tester à fond n'importe quel élément que tu crées, sans étape
supplémentaire. Ça ne change rien pour les autres comptes : un joueur
continue de devoir recevoir chaque décoration/thème/tag/fond de profil
normalement, un par un.

### Fond de profil sur toute la fenêtre du profil

Le fond de profil (ajouté en v8.5) ne couvrait que la petite carte à
l'intérieur de la popup "Voir le profil" — il couvre maintenant **toute
la fenêtre** : le titre "Profil" en haut, la carte du joueur, et le
bouton "Gérer ce joueur" en bas. Même chose dans la fiche de recherche
organisateur (carte + tags). Sur l'écran d'accueil, rien ne change :
c'était déjà toute la fiche qui était couverte.

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
télécharge d'abord le **gabarit (900×1200, portrait — voir v8.7)** pour
composer l'image aux bonnes proportions dans ton logiciel préféré. Comme
les décorations, un fond créé démarre "non publié" (visible seulement par
toi le temps de le
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

## Nouveau dans cette version — mode spectateur

Un nouveau bouton **"👀 Spectateur"** sur l'écran d'accueil, accessible à
n'importe quel compte connecté (joueur comme organisateur). Cet écran est
**en lecture seule** : aucune action possible dessus (pas de proposition
de duel, pas d'inscription à un événement), juste de la consultation.

Il montre deux choses, uniquement pour **aujourd'hui** :

- Les **duels du jour terminés aujourd'hui**, avec le score, le
  vainqueur, et — une fois le duel terminé seulement — les decks joués
  par chacun s'il y en a (jeu configuré avec des éléments).
- L'**événement en cours ou tout juste terminé aujourd'hui** : pendant
  qu'il tourne, seuls les appariements/résultats de la manche en cours
  sont visibles (jamais les decks, qui restent cachés comme pour tout le
  monde tant que l'événement n'est pas terminé) ; une fois terminé, le
  classement final complet apparaît, decks compris.

Dès qu'il n'y a plus rien à montrer sur la journée (rien de fini
aujourd'hui côté Duel du jour, pas d'événement en cours ni terminé
aujourd'hui), l'écran affiche simplement "rien à voir pour l'instant" —
il ne remonte jamais l'historique des jours précédents. Aucune règle
Firestore supplémentaire n'a été nécessaire pour cacher les decks : les
règles existantes empêchaient déjà un compte qui n'est ni participant ni
organisateur de lire un deck avant la fin du duel/événement.

## Nouveau dans cette version — système de parrainage

À l'inscription, une petite fenêtre demande maintenant **"As-tu été
parrainé par quelqu'un ?"** (Oui/Non) — posée une seule fois, juste après
la création du compte, avant d'arriver sur l'écran principal. En
répondant "Oui", le nouveau joueur indique le **pseudo** de la personne
qui l'a parrainé (vérifié : un message d'erreur s'affiche si le pseudo
n'existe pas).

Dès que ce filleul termine son **tout premier Duel du jour** (peu
importe s'il gagne ou perd — c'est le fait de jouer qui compte), **les
deux comptes** — filleul et parrain — reçoivent automatiquement un tag
récompense. Ce tag n'est pas fixé en dur dans le code : c'est un tag que
**toi, l'organisateur**, crées comme n'importe quel autre (Espace
organisateur > Tags), en cochant simplement la case **"Récompense de
parrainage"** au moment de le créer (ex. le tag "The Godfather" demandé).
Tant qu'aucun tag n'est marqué ainsi, le parrainage fonctionne toujours
(le pseudo du parrain est bien enregistré) mais la récompense ne se
déclenche pas — comme les autres catalogues pas encore configurés dans
l'appli.

Un nouveau bloc **"🎁 Parrainage"** apparaît dans Réglages pour chaque
joueur : indique s'il a été parrainé et si la récompense est arrivée, et
un compteur "Tu as parrainé N joueur(s)" — pour de futures récompenses
liées au nombre de filleuls, si tu le souhaites plus tard.

Contre les abus : un joueur ne peut jamais accorder ce tag lui-même à
n'importe qui — la seule écriture autorisée sur le compte d'un tiers est
strictement encadrée côté serveur (Firestore) : uniquement l'ajout de
CE tag précis, uniquement par le filleul déclaré vers son parrain
déclaré, rien d'autre sur le compte visé ne peut être modifié par ce
chemin. C'est pour cette raison que la republication des règles
Firestore est obligatoire cette fois-ci (voir "Mise à jour depuis une
version précédente" plus haut).

## Nouveau dans cette version — écran d'affichage organisateur

Un bouton **"📺 Écran d'affichage"** dans l'Espace organisateur, réservé
à ton compte organisateur. L'idée : l'ouvrir sur un second écran ou une
télé installée en boutique, que tout le monde peut regarder, plutôt que
chacun sorte son téléphone pour vérifier où il en est.

Il regroupe, dans un seul écran qui se met à jour tout seul :

- Le **chronomètre** de la manche en cours d'un événement.
- Le **placement provisoire** des joueurs pendant l'événement (victoires
  / défaites de chacun, mis à jour en direct).
- Le **score final** de l'événement une fois terminé, avec les decks
  utilisés par chaque joueur.
- Le **classement du défi du jour** : les points gagnés aujourd'hui
  seulement via le Duel du jour (3 points par victoire, 1 point par
  défaite, plafonné à 15 points/jour — mêmes règles que le classement de
  saison, mais remis à zéro chaque nouveau jour).

D'autres blocs pourront s'y ajouter facilement par la suite, comme tu
l'avais mentionné.

À noter : le chronomètre d'une manche d'événement (bouton "Lancer le
chronomètre") était **déjà** exclusivement déclenché par toi,
l'organisateur — jamais par les joueurs — et **déjà synchronisé** pour
tout le monde (basé sur l'heure de lancement enregistrée côté serveur,
pas sur l'horloge de chacun).

**Depuis la v11**, cet écran a été retravaillé pour un vrai deuxième
écran/une télé au fond de la boutique, lue de loin :

- **Tout est agrandi** par rapport au reste de l'appli, et le
  **chronomètre est nettement le plus gros élément de l'écran**
  (facilement lisible à plusieurs mètres).
- Le bouton "📺 Écran d'affichage" **ouvre maintenant un nouvel onglet du
  navigateur** (plutôt que de naviguer à l'intérieur de l'appli) — il
  reste donc affiché tout seul, dans son propre onglet, pendant que tu
  continues à utiliser l'appli normalement sur ton téléphone/ordinateur
  à côté.
- **Il n'y a plus de bouton pour "fermer" cet écran** : c'est
  volontairement un écran "juste les informations", pensé pour rester
  affiché en continu — ferme simplement l'onglet du navigateur quand tu
  veux l'arrêter.
- Techniquement, ce nouvel onglet doit être ouvert **depuis un
  navigateur où ton compte organisateur est déjà connecté** (comme
  n'importe quel nouvel onglet du même site) — s'il te redemande de te
  reconnecter, c'est juste que ce navigateur-là n'avait pas encore de
  session ouverte.

## Nouveau dans cette version — écran Calendrier (inscription à l'avance)

> ⚠️ **Remplacé en v12** — voir plus bas "Nouveau dans cette version —
> Calendrier totalement indépendant de l'Événement". Depuis la v12, le
> Calendrier n'est plus du tout lié aux vrais Événements ni à leurs
> inscriptions : cette section ci-dessous décrit son ancien
> fonctionnement (v9 à v11), gardée ici pour l'historique.

Un nouveau bouton **"📅 Calendrier"**, visible depuis l'accueil par tout
le monde (organisateur comme joueurs) — à ne pas confondre avec le petit
calendrier "événements à venir" en bas de l'écran Événement (toujours là,
voir plus bas) : celui-ci est un **écran à part entière**, avec une
**vraie vue mensuelle** (une case par jour, comme un calendrier classique)
qui montre TOUS les tournois pas encore terminés — y compris celui géré
en ce moment depuis l'écran Événement.

- Chaque jour où un tournoi est programmé affiche une petite **puce**
  avec le nom du jeu ; un clic dessus déplie le détail du tournoi
  (jeu, format, date, temps par manche) sous le calendrier.
- Si le tournoi accepte encore les inscriptions, un bouton
  **"🙋 Je participe"** permet de s'inscrire à l'avance — y compris pour
  un tournoi qui n'est **pas** celui actuellement géré par
  l'organisateur (même mécanisme d'inscription que depuis l'écran
  Événement, juste appliqué au tournoi choisi dans le calendrier).
  Comme d'habitude, l'inscription d'un joueur reste "en attente" tant
  que toi, l'organisateur, ne l'as pas validée.
- Un bouton **"[N] inscrits"** affiche le nombre de joueurs déjà
  inscrits (validés) à ce tournoi ; cliquer dessus déplie la liste
  complète de leurs pseudos.
- Comme avant, **c'est toi qui programmes les tournois à l'avance**
  (formulaire "Programmer un événement" depuis Événement >
  Organisateur) — le calendrier ne fait qu'afficher ce que tu as déjà
  programmé, il ne crée rien de lui-même.

Limite actuelle : la validation des inscriptions (accepter un joueur en
liste d'attente) reste possible uniquement pour le tournoi **actuellement
géré** depuis l'écran Événement — un joueur qui s'inscrit depuis le
Calendrier à un tournoi plus lointain reste "en attente" jusqu'à ce que
ce tournoi devienne celui géré activement (le plus proche dans le
temps parmi ceux encore programmés).

## Nouveau dans cette version — points de saison depuis les Événements

Si une saison est **en cours** au moment où un match d'Événement se
termine, les points gagnés comptent maintenant dans le classement de la
saison — **exactement les mêmes règles que le Duel du jour** :
**3 points par victoire, 1 point par défaite**, avec le même plafond de
**15 points par jour** — et ce plafond est **partagé** entre Duel du
jour et Événement : un joueur qui gagne des duels ET un match
d'événement le même jour reste plafonné une seule fois pour la journée,
pas deux plafonds séparés. Un bye (tour où un joueur n'a personne en
face) compte comme une victoire automatique pour les points de saison,
comme pour le classement du tournoi lui-même.

Avant cette version, seul le Duel du jour rapportait des points de
saison — l'Événement n'y contribuait pas du tout. Le total "à vie" visible
sur l'accueil ("Points (total)") suit la même règle et inclut donc lui
aussi les points d'événement, pour rester cohérent avec l'écran Saison.
Les statistiques "Victoires"/"Défaites" à vie de l'accueil, elles,
restent volontairement propres au Duel du jour uniquement (comme avant),
tout comme les "points cumulés" de départage en cas d'égalité dans le
classement de saison (propres aux duels, sans équivalent naturel pour un
match de tournoi).

## Nouveau dans cette version — Calendrier totalement indépendant de l'Événement

Le bouton **"📅 Calendrier"** (visible par tout le monde depuis
l'accueil) fonctionne maintenant complètement à part du système
d'Événement (tournois joués sur place) — **aucune synchronisation entre
les deux** :

- Une "annonce" du calendrier n'est plus qu'une simple date + un jeu,
  créée par toi (organisateur) depuis le nouveau petit formulaire en
  haut de l'écran Calendrier — ce n'est plus un vrai Événement
  programmé à l'avance (l'Événement, lui, se joue maintenant
  **toujours "aujourd'hui"**, voir la section suivante).
- **Aucune inscription, aucune validation** : n'importe quel compte
  connecté peut cliquer **"🙋 Je suis intéressé(e)"** pour dire qu'il
  pense venir (et re-cliquer pour se retirer) — ça ne fait qu'ajouter
  ou retirer son propre nom d'une liste, tu n'as rien à valider. Le
  bouton "[N] intéressé(e)s" déplie la liste des joueurs concernés.
- Tu peux supprimer une annonce à tout moment depuis le panneau
  organisateur de l'écran Calendrier.

En clair : le Calendrier sert maintenant uniquement à **annoncer une
date à l'avance** ("le prochain tournoi Pokémon, c'est samedi") pour
que les joueurs sachent s'organiser, sans aucune mécanique
d'inscription — l'inscription elle-même se fait toujours normalement
depuis l'écran Événement, le jour même.

## Nouveau dans cette version — un Événement se joue "maintenant"

Conséquence directe du découplage ci-dessus : créer un Événement ne
demande plus de choisir une date — le formulaire "Démarrer un
événement" ne propose plus que le jeu, le format et (nouveau, voir
juste en dessous) le type de tournoi. L'Événement créé est daté du jour
même automatiquement, en coulisses, uniquement pour que les points de
saison continuent de se rattacher à la bonne journée (voir "points de
saison depuis les Événements" plus haut) — cette date n'est plus
affichée nulle part.

## Nouveau dans cette version — tournoi par élimination directe

Le formulaire de création d'un Événement propose maintenant un choix
**"Type de tournoi"** :

- **Tournoi à la suisse** (comme avant, par défaut) : tout le monde
  joue à chaque manche, appariements par groupes de victoires.
- **Tournoi par élimination** (nouveau) : un bracket classique — une
  défaite élimine le joueur. Si le nombre d'inscrits n'est pas une
  puissance de 2 (4, 8, 16…), certains joueurs reçoivent un **bye**
  (victoire automatique) à la première manche pour que le bracket
  tombe juste ; ça ne peut plus arriver aux manches suivantes. Le
  bouton "Lancer/manche suivante" s'appelle "Manche suivante (bracket)"
  dans ce mode pour que ce soit clair, mais fonctionne pareil — même
  chronomètre par manche, mêmes doubles-validations de résultat que le
  tournoi à la suisse.

## Nouveau dans cette version — arbre visuel du bracket (écran d'affichage)

Quand un Événement est en mode **élimination**, l'écran d'affichage
(le second écran/la télé en boutique) montre en plus un **arbre visuel
du tournoi**, manche par manche, avec :

- la **photo de profil et la décoration active** de chaque joueur à
  côté de son pseudo (même rendu que partout ailleurs dans l'appli) ;
- les joueurs **éliminés affichés barrés**, pour repérer d'un coup
  d'œil qui est encore en course ;
- le **chronomètre de la manche en cours**, affiché aussi juste
  au-dessus de l'arbre (le même compte à rebours que celui affiché à
  côté des appariements) ;
- un **trophée** qui apparaît à côté du nom du vainqueur une fois la
  finale jouée et l'événement terminé.

Ce tournoi à la suisse continue, lui, de n'afficher que le placement
provisoire (comme avant) — l'arbre est spécifique au mode élimination,
puisque c'est là que la structure "qui affronte qui à la prochaine
manche" prend tout son sens visuellement.

## Nouveau dans cette version — Système de succès

Un nouveau bouton **"🏆 Succès"** est apparu sur l'écran d'accueil, à
côté de "🏅 Saison actuelle". Il ouvre un écran qui liste les **24
familles de succès**, chacune avec :

- une **rangée de paliers** (1 à 5 selon la famille), le palier déjà
  atteint mis en évidence et les suivants affichés verrouillés (🔒) ;
- une **barre de progression** vers le prochain palier, avec le chiffre
  exact ("237 / 500" par exemple) ;
- le **titre débloqué**, affiché en clair une fois le dernier palier
  atteint.

**Attribution 100% automatique** : dès qu'un joueur remplit la
condition d'un palier (en jouant, normalement — pas besoin d'ouvrir
l'écran Succès pour que ça se déclenche), le **tag correspondant lui
est attribué tout seul**, exactement comme le tag de saison ou la
récompense de parrainage déjà en place — tu n'as **rien à valider**.
Le **dernier palier** de chaque famille donne, lui, un **titre** (pas
de tag à ce palier-là — c'est le titre qui marque l'aboutissement de la
famille). Le recalcul se déclenche automatiquement juste après chaque
duel/match validé, et à chaque ouverture de l'écran "Succès" (qui
rattrape aussi tout ce qui aurait pu être manqué, par exemple les
succès déjà mérités par un joueur qui existait avant que cette version
soit mise en ligne).

### Les 24 familles de succès

**Reprises de tes toutes premières idées :**

- **Duels joués** (5 paliers : 1 / 50 / 200 / 500 / 1000) → titre 🏛️
  Vétéran de l'Arène
- **Victoires d'affilée** (4 paliers : 2 / 5 / 10 / 25) → titre ☄️ EN
  FEUUUU
- **Participation aux Événements** (4 paliers : 1 / 5 / 20 / 50) →
  titre 🔁 Encore un tour
- **Duels Lorcana** (3 paliers : 10 / 50 / 200) → titre 🧬 Lorcana dans
  mes gènes
- **Duels Pokémon** (3 paliers : 10 / 50 / 200) → titre 🧬 Pokémon dans
  les gènes
- **Perfects** — duel gagné en laissant l'adversaire à 0 (4 paliers : 1
  / 3 / 6 / 15) → titre 👹 MONSTER KILL
- **Comeback à 1 point de vie** (3 paliers : 1 / 5 / 10) → titre 🎭
  Remontada
- **Score max Duel du jour** (4 paliers : 1 / 10 / 25 / 50) → titre 👑
  Empereur de la journée

**Imaginées ensemble ensuite :**

- **Assiduité** — jours différents joués (5 paliers : 3 / 10 / 30 / 75
  / 150) → titre 🏠 Ici c'est chez moi
- **Polyvalent** — duels dans CHAQUE jeu proposé (5 paliers : 5 / 15 /
  30 / 60 / 100) → titre 🌈 L'as de tous les jeux
- **Parrain en série** (5 paliers : 1 / 3 / 8 / 15 / 25) → titre 🌳
  Tête de réseau
- **Collectionneur** — tags différents possédés (5 paliers : 5 / 10 /
  25 / 50 / 75) → titre 🗃️ Collectionneur
- **Fidèle à un deck** — même élément/archétype (5 paliers : 3 / 8 / 15
  / 25 / 40) → titre 🃏 Signature
- **Rival** — adversaires différents affrontés (5 paliers : 2 / 5 / 10
  / 15 / 25) → titre 🤝 Je connais tout le monde
- **Rivalité** — duels rejoués contre le même adversaire (5 paliers : 3
  / 5 / 10 / 20 / 40) → titre ⚔️ Ma Nemesis
- **Points à vie** (5 paliers : 50 / 100 / 500 / 1000 / 2500) → titre
  Légende Immortelle
- **Ancien de la maison** — ancienneté du compte (5 paliers : 1 / 3 / 6
  / 12 / 24 mois) → titre 🏛️ Ancien de la maison
- **Champion de tournoi** — Événements remportés (4 paliers : 1 / 3 / 8
  / 15) → titre ⚜️ Grand Champion
- **Sur le podium** — top 3 en fin de saison (4 paliers : 1 / 5 / 10 /
  25) → titre 🏆 Increvable
- **Come-back kid** — perdre la 1ère manche en suisse mais finir sur le
  podium (4 paliers : 1 / 3 / 5 / 10) → titre 🎭 Le roi du comeback
- **David contre Goliath** — battre un adversaire avec plus de
  victoires à vie que toi (4 paliers : 1 / 3 / 5 / 10) → titre David
  contre Goliath
- **La poisse** — défaites d'affilée (4 paliers : 3 / 5 / 8 / 12) →
  titre 🐌 La poisse ultime
- **Champion de saison** — 1er au classement final d'une saison (1
  palier) → titre 👑 Champion de saison
- **Platine** — débloquer tous les autres succès (1 palier) → titre 💠
  Platine

### Quelques précisions techniques (pour toi, pas pour les joueurs)

- **"Comeback à 1 point de vie"** ne se déclenche que sur les jeux pour
  lesquels tu as configuré une condition de victoire **"points de vie"**
  (voir "condition de victoire par jeu" plus haut) — sans ça, un duel
  n'a tout simplement pas de notion de "point de vie restant" à
  regarder. Rien à faire de ton côté si tu l'as déjà configurée sur
  Pokémon/Lorcana/etc.
- **"David contre Goliath"** compare le nombre de victoires à vie
  actuel des deux joueurs (pas au moment exact du duel) — un joueur qui
  a beaucoup progressé depuis pourrait ne plus "compter" comme un
  outsider pour un vieux duel. Cas rare, effet mineur.
- **"Sur le podium" et "Champion de saison"** ne comptent que les
  saisons déjà terminées (date de fin dans le passé) — la saison en
  cours n'a pas encore de classement "définitif" tant qu'elle n'est pas
  finie.
- Les tags/titres de succès n'existent **pas** comme catalogue Firestore
  (rien à publier/dépublier, rien créé à la main) — ils n'apparaissent
  donc jamais dans tes listes de gestion "Décorations, thèmes, tags &
  jeux". Un joueur peut en revanche les choisir comme tag actif ou
  comme titre affiché, exactement comme les autres.
- Comme pour les scores de duel auto-déclarés, l'appli fait confiance
  au joueur sur la condition elle-même (avoir vraiment joué 500 duels,
  etc.) — les règles Firestore ne vérifient que la forme de
  l'attribution (un seul tag/titre de succès ajouté à la fois), pas la
  réalité du score. C'est le même niveau de confiance que pour le reste
  de l'appli sur ce plan Firebase gratuit (pas de Cloud Functions
  disponibles pour vérifier côté serveur).

## Nouveau dans cette version — Installation en PWA

Une nouvelle section **"📱 Application"** apparaît dans les Réglages
(juste avant "Zone de danger"), avec un bouton d'installation et un
message qui s'adapte à l'appareil :

- **Android / Chrome / Edge (téléphone ou ordinateur)** : un bouton
  **"Installer l'application"** propose directement l'installation —
  Car'Tech Arena apparaît ensuite comme une icône sur l'écran d'accueil
  (ou dans les applications installées), s'ouvre en un tap, en plein
  écran, sans barre d'adresse.
- **iPhone/iPad (Safari)** : Apple ne permet pas ce bouton — le message
  explique la marche à suivre native : bouton de partage ⬆️ de Safari,
  puis **"Sur l'écran d'accueil"**. C'est la seule façon d'installer une
  app web sur iPhone, aucune appli ne peut le faire à ta place.
- **Application déjà installée** : le message le confirme simplement,
  pas de bouton à afficher.

### Précisions techniques (pour toi)

- L'appli fonctionne exactement pareil une fois installée — c'est la
  même page web, juste ouverte sans les habillages du navigateur
  (barre d'adresse, onglets). Rien ne change côté Firebase ni côté
  fonctionnalités.
- Volontairement, l'installation ne met **aucune page en cache** : à
  chaque ouverture, l'appli va toujours chercher la dernière version en
  ligne (comme dans un onglet de navigateur classique). C'est un choix
  assumé pour ne jamais risquer qu'un joueur ou toi-même se retrouve
  bloqué sur une ancienne version après une mise à jour — seulement un
  peu moins utile hors connexion, ce qui n'a de toute façon pas de sens
  ici (l'appli a besoin d'internet pour parler à Firebase).

## Ce qui n'est pas encore fait (prochaine étape)

- Un classement général "toutes saisons confondues" (le système de saisons
  couvre un classement PAR saison programmée — depuis la v11, il inclut
  bien les points gagnés en Événement en plus du Duel du jour, mais il
  n'existe toujours pas d'écran dédié qui cumule TOUTES les saisons
  passées dans un seul classement).
- Un vrai système de départage en cas d'égalité en fin d'événement.
- La gestion propre d'un abandon en cours d'événement.
- La suppression d'un jeu (TCG) une fois créé — volontairement non permise,
  car déjà référencé par l'historique des matchs et des événements passés.
- La mise à jour en direct du profil d'un joueur déjà connecté quand
  l'organisateur lui attribue quelque chose (voir la limite ci-dessus) —
  même limite pour la récompense de parrainage : le filleul et le
  parrain la voient apparaître dans Réglages après reconnexion (ou à
  l'ouverture suivante de l'appli), pas forcément à l'instant même où
  elle est accordée s'ils sont déjà connectés.
- Les **statistiques de victoire par deck/archétype** (ex. "quel deck
  gagne le plus", taux de victoire par élément) — pour l'instant, seule
  la déclaration/révélation du deck joué à chaque duel/événement est en
  place ; le calcul de stats agrégées par deck n'est pas encore fait.
- Le **tableau de bord organisateur** se base uniquement sur l'activité
  du Duel du jour (pas encore sur les inscriptions/matchs d'Événement).
- Le seuil de "joueur régulier" du tableau de bord (3 jours différents
  sur 30) n'est pas encore réglable depuis l'appli.
- Le **Calendrier** ne gère pas les annonces récurrentes (un tournoi
  chaque semaine par ex.) — chaque date s'ajoute encore une par une.
- En mode **élimination**, pas de match de "3e place" ni de vrai
  système de repêchage — une défaite élimine directement, sans autre
  forme de classement fin que l'ordre victoires/défaites habituel pour
  les non-finalistes.
- L'arbre visuel du bracket (écran d'affichage) n'affiche que les
  manches déjà appariées — pas encore de "cases vides" en pointillés
  pour visualiser à l'avance la structure des manches futures.
