# Suivi Prospection — Guide utilisateur

Ce guide s'adresse aux distributeurs qui utilisent l'application au
quotidien pour suivre leur prospection. Pour la documentation technique
(installation, API, base de donnees), voir
[documentation-technique.md](documentation-technique.md).

## 1. Créer un compte et se connecter

L'écran d'accueil présente l'outil (ce qu'il apporte, le prix de
l'abonnement et les étapes pour démarrer) à côté de deux onglets :

- **Connexion** : numéro de téléphone (avec indicatif) + mot de passe.
- **Créer un compte** : nom complet, numéro, mot de passe (6 caractères
  minimum).

Un nouveau compte est créé **inactif** : règle l'abonnement (instructions
dans **"⋮" → "Mon abonnement"** ou auprès de ton administrateur), puis
l'administrateur active ton compte. Chaque activation donne accès pour une
durée fixe (30 jours par défaut).

Quand l'abonnement expire, tu as **3 jours de grâce** : ton compte reste
consultable en **lecture seule**, avec un bandeau rouge et un bouton
"Comment renouveler". Sur l'app mobile, ce que tu modifies hors ligne
pendant ces jours est gardé en attente et synchronisé dès le
renouvellement. Passé ce délai, l'accès est coupé. Un compte désactivé par
l'administrateur est coupé immédiatement.

Chaque compte est totalement isolé : tu ne vois que tes propres contacts,
jamais ceux d'un autre distributeur.

Après 4 mots de passe erronés depuis un même appareil / une même connexion,
ce dernier est bloqué 15 minutes sur ce compte (protection anti-piratage).
Les autres appareils ne sont pas bloqués : quelqu'un qui essaie de deviner
ton mot de passe ne peut pas t'empêcher de te connecter. Un administrateur
peut lever tous les blocages depuis l'espace Admin.

## 2. Aujourd'hui (écran d'accueil)

C'est l'écran qui s'ouvre à la connexion : **qui contacter aujourd'hui**,
du plus urgent au moins urgent.

**Bien démarrer** : sur un nouveau compte, une carte en haut de l'écran
guide les trois premières étapes (ajouter ses contacts, préparer ses
messages avec les **messages types** fournis, envoyer son premier message).
Elle disparaît une fois les trois étapes faites, ou avec "Masquer". Un contact n'apparaît que dans une seule
section, la plus urgente.

- **Anniversaires** : les contacts dont c'est l'anniversaire aujourd'hui.
- **Relances en retard** : la date de relance prévue est passée.
- **Relances d'aujourd'hui** : relances prévues dans la journée.
- **Réachats à proposer** : clients dont le délai de réachat est atteint
  (voir § 6).
- **Contacts qui refroidissent** : contacts en cours (Contacté à En
  décision) sans mouvement depuis 7 jours ou plus, et sans relance prévue.
- **Jamais contactés** : nouveaux contacts sans relance prévue.

Sur chaque ligne :

- **Message** ouvre l'envoi d'un message WhatsApp (voir § 5).
- **Demain** programme une relance le lendemain à 9h.
- Un clic sur le nom ouvre la fiche du contact.

Les longues sections affichent les 10 premiers contacts, avec un bouton
"Voir les N autres". Sur grand écran, les sections se répartissent sur deux
colonnes.

## 3. Le pipeline (vue "Pipeline")

Un tableau kanban à 7 colonnes représentant les étapes de la relation avec
un contact :

1. **À contacter** (sur ta liste, pas encore joint)
2. **Contacté**
3. **Prospect**
4. **Intéressé**
5. **En décision**
6. **Client** / **Partenaire** (deux colonnes finales, selon le type
   d'intérêt du contact)

Chaque contact est une carte. Pour le faire avancer :

- le bouton en bas de la carte (ex : **"Contacté ›"**) le passe à l'étape
  suivante en un clic ;
- sur ordinateur, tu peux aussi **glisser la carte** dans une autre colonne ;
- ou utiliser les boutons d'étape dans la fiche détail.

Chaque changement d'étape est enregistré définitivement dans son historique.

**Indicateur d'ancienneté** : la bordure d'une carte devient orange puis
rouge si le contact n'a pas bougé depuis plusieurs jours — un signal visuel
pour repérer les prospects qui stagnent. Les clients et partenaires sont en
**vert** : ce sont des réussites, pas des contacts qui stagnent. Leur carte
indique depuis quand ils sont clients et la date du prochain réachat.

**Température** : si tu as indiqué ton ressenti sur un contact (Froid,
Tiède, Chaud — voir § 4), il s'affiche en couleur sur sa carte.

**Colonnes repliables** : clique sur l'en-tête d'une colonne pour la
replier/déplier. Cette préférence est mémorisée sur cet appareil.

**Longues colonnes** : chaque colonne affiche 30 contacts, puis un bouton
"Afficher 30 de plus" (le compteur en haut de la colonne donne le total).

**Actions groupées** : le bouton **"Sélectionner"** en haut du pipeline
transforme les cartes en cases à cocher. Touche les contacts à modifier, ou
**"Tout"** en haut d'une colonne pour la sélectionner en entier (y compris
les contacts pas encore affichés). Une barre en bas de l'écran permet alors
de, en une fois : déplacer vers une étape, changer la température,
programmer une relance demain à 9h, effacer la relance, ou marquer comme
perdus (restaurables depuis "Archives"). Il n'y a volontairement pas de
suppression définitive groupée. "Terminer" (ou Échap) quitte le mode
sélection. Nécessite une connexion.

**Sur téléphone** : une rangée d'onglets en haut du pipeline (avec le
nombre de contacts par étape) affiche une étape à la fois.

## 4. La fiche détail d'un contact

Cliquer sur une carte ouvre sa fiche, organisée pour l'action :

- **En haut, le résumé** : l'étape actuelle et depuis combien de temps, le
  **dernier échange** (type, date, contenu), la **prochaine relance**
  (modifiable directement, enregistrée dès que tu changes la date) et la
  **température** (Froid / Tiède / Chaud, en un clic ; un second clic
  l'efface).
- **Message type** (en-tête) : envoyer un message WhatsApp à partir d'un
  modèle (voir § 5). Le bouton vert "Contacter sur WhatsApp" ouvre une
  conversation vide.
- **Actions d'étape** : boutons (ou menu déroulant sur mobile).
- **Ajouter une interaction** puis **Historique des interactions** : journal
  de chaque prise de contact (appel, message, rencontre, note libre).
- **Achats** (clients et partenaires) : voir § 6.
- **Coordonnées** (section repliée, à ouvrir au besoin) : nom, téléphones,
  localisation, **anniversaire**, source, type d'intérêt — bouton
  "Enregistrer les coordonnées".
- **Chronologie des étapes** : historique complet et permanent de tous les
  changements d'étape.
- **Autres actions** (section repliée) :
  - **Marquer comme perdu** : archive le contact (sort du pipeline actif,
    mais reste consultable dans "Archives" — rien n'est perdu).
  - **Supprimer définitivement** : à utiliser seulement pour une vraie
    erreur (doublon, mauvaise saisie) — contrairement à l'archivage, c'est
    irréversible.

## 5. Messages WhatsApp et modèles

Le bouton **Message** (vue Aujourd'hui) ou **Message type** (fiche) ouvre
une fenêtre d'envoi :

1. Choisis un modèle : le texte se remplit avec les informations du
   contact. Tu peux le modifier avant l'envoi.
2. **Ouvrir WhatsApp** ouvre la conversation avec le message prêt.

Le message est automatiquement ajouté à l'historique du contact. Si le
contact était encore "À contacter", il passe à **"Contacté"**.

**Gérer les modèles** : menu **"⋮" → "Mes modèles de message"** (ou le
bouton "Gérer les modèles" dans la fenêtre d'envoi). Variables
disponibles :

| Variable   | Remplacée par                   |
|------------|---------------------------------|
| `{prenom}` | prénom du contact               |
| `{nom}`    | nom complet du contact          |
| `{ville}`  | ville du contact                |
| `{moi}`    | ton prénom                      |

Exemple : `Bonjour {prenom}, c'est {moi} ! Je pense à toi pour…`

## 6. Achats et réachats (clients)

Dans la fiche d'un client ou d'un partenaire, la section **Achats** permet
d'enregistrer chaque commande (date, produit, montant).

Indique un **rappel de réachat tous les N jours** (ex : 30) : la date du
prochain réachat s'affiche, et le client apparaît dans "Réachats à
proposer" (vue Aujourd'hui) une fois cette date atteinte. Enregistrer un
nouvel achat repousse automatiquement le rappel.

Les montants alimentent le chiffre d'affaires dans les statistiques.

## 7. Recherche et filtres

Icône loupe en haut du pipeline : recherche par nom/numéro, et filtres
combinables par source, type d'intérêt, température, pays et ville. Le
badge sur l'icône indique combien de filtres sont actifs.

## 8. Relances

Chaque contact peut avoir une date de "prochaine relance". L'icône cloche en
haut de l'app indique les relances dues (avec badge de comptage), et la vue
Aujourd'hui les classe. Sur l'app mobile, une **notification locale** est
programmée automatiquement à l'heure de la relance.

**Résumé du matin** (app mobile) : chaque jour à 8h, une notification
résume ta journée ("Aujourd'hui : 3 relances, 1 anniversaire, 2 réachats à
proposer"), calculée comme la vue Aujourd'hui, même sans réseau. Rien à
signaler = pas de notification. Activable / désactivable dans le menu
**"⋮" → "Résumé du matin (8h)"**.

## 9. Statistiques

Onglet **"Statistiques"**, avec une période au choix (7 jours, 30 jours,
90 jours ou tout l'historique) :

- **Ton activité** : ton **objectif de la semaine** (nombre d'actions —
  messages, appels, rencontres — à faire en 7 jours, avec une barre de
  progression ; bouton "Fixer un objectif" / "Modifier"), le nombre
  d'actions, de nouveaux contacts, d'étapes franchies, de conversions et ton
  **chiffre d'affaires** (achats enregistrés).
- **Entonnoir** : sur les contacts ajoutés pendant la période, combien ont
  atteint chaque étape — pour voir où ça bloque.
- **Temps de conversion** : temps médian (avec min/max) entre l'ajout d'un
  contact et sa conversion en client ou partenaire.
- **Répartition par pays** et **par source**, avec taux de conversion. Les
  contacts marqués "perdu" comptent dans les taux : un taux ne monte pas
  parce qu'on archive ses échecs.

## 10. Archives

Onglet **"Archives"** : liste des contacts marqués "perdu". Un contact
archivé peut être restauré à tout moment vers le pipeline actif.

## 11. Importer des contacts en masse

Menu **"⋮" → "Importer des contacts"** : dépose tel quel l'export CSV de
[Google Contacts](https://contacts.google.com/) (aucune conversion
nécessaire). L'ancien format `Name, Country Code, Phone Number, Country`
est aussi accepté.

Comportement :

- Les lignes sans nom exploitable, ou avec un numéro invalide, sont
  ignorées.
- Les doublons (dans le fichier, ou déjà présents dans ton pipeline) sont
  ignorés silencieusement — le résumé après import indique les comptes. Tu
  peux donc réimporter le même fichier sans risque de doublons.
- Les **anniversaires** présents dans Google Contacts sont repris.

Chaque contact importé entre avec la source "Annuaire téléphonique" et
l'étape "À contacter" — il apparaît alors dans "Jamais contactés".

## 12. Utilisation hors ligne (app mobile)

Sur l'app Android, la plupart des actions fonctionnent aussi sans
connexion : vue Aujourd'hui, consultation du pipeline, ajout/modification
de contacts, changement d'étape, interactions, envoi d'un message à partir
d'un modèle. Un indicateur "Hors ligne" apparaît en haut de l'écran, avec
le nombre d'actions en attente de synchronisation. Dès que la connexion
revient, tout se synchronise automatiquement avec le serveur.

Si ta session a expiré entre-temps, rien n'est perdu : l'indicateur affiche
"Reconnecte-toi", et la synchronisation reprend après la connexion. Si le
serveur refuse une modification (contact supprimé entre-temps, par
exemple), l'indicateur affiche "échec(s) de synchro · voir" : touche-le
pour voir le détail.

Certaines actions nécessitent une connexion (création de compte, import en
masse, création de modèles, enregistrement d'achats, statistiques, gestion
des comptes admin).

Fais glisser vers le bas en haut du pipeline pour forcer un rafraîchissement
("pull-to-refresh").

## 13. Espace Admin (comptes administrateurs uniquement)

Onglet **"Admin"**, visible seulement si ton compte a les droits
administrateur.

**Renouvellements** (en haut) : compteurs (comptes actifs, abonnements qui
expirent sous 7 jours, expirés depuis moins de 30 jours, inscrits sans
paiement) et trois listes à traiter :

- **Expirent bientôt** et **Expirés récemment** : bouton **"Relancer"** qui
  ouvre WhatsApp avec un message prêt (date d'expiration, prix et
  instructions de paiement configurés dans `.env`).
- **Inscrits, en attente de paiement** (inscrits ces 30 derniers jours,
  jamais activés) : bouton **"Envoyer les instructions"**.
- Chaque relance est notée ("Relancé il y a 2 jours") pour ne pas relancer
  deux fois la même personne par erreur.
- **"Renouveler"** / **"Activer"** démarre une nouvelle période d'abonnement.

**Comptes utilisateurs** (en dessous) :

- Liste de tous les comptes du système, avec l'état de leur abonnement.
- **Activer / Renouveler** un compte (démarre une nouvelle période
  d'abonnement) ou le désactiver (la personne est déconnectée
  immédiatement).
- Débloquer un compte verrouillé après échecs de connexion.
- Réinitialiser le mot de passe d'un compte (déconnecte automatiquement
  toute session active sur ce compte).

## 14. Donner mon avis

Menu **"⋮" → "Donner mon avis"** : envoie un **problème**, une **idée de
fonctionnalité**, une **question** ou autre chose directement à l'équipe
SuiviPro, qui te répond sur WhatsApp. Fonctionne même pendant les jours de
grâce après l'expiration de l'abonnement. Nécessite une connexion.

Côté administrateur, ces messages apparaissent dans l'onglet **Admin**,
section **"Retours utilisateurs"** (filtre "À traiter" / "Tous") : qui,
quand, depuis quel appareil et quelle version, avec un bouton **"Répondre"**
(WhatsApp, message cité) et **"Marquer traité"** / **"Rouvrir"**.

## Bon à savoir

- Un compte = un pipeline totalement isolé. Pour t'entraîner ou faire une
  démo sans polluer tes vraies données, crée un second compte de test.
- Rien n'est jamais supprimé silencieusement : l'historique des étapes et
  les contacts archivés restent consultables indéfiniment. Seule la
  suppression manuelle et volontaire d'un contact est irréversible.
