# Suivi Prospection — Guide utilisateur

Ce guide s'adresse aux distributeurs qui utilisent l'application au
quotidien pour suivre leur prospection. Pour la documentation technique
(installation, API, base de donnees), voir
[documentation-technique.md](documentation-technique.md).

## 1. Créer un compte et se connecter

À l'ouverture de l'app, l'écran de connexion propose deux onglets :

- **Connexion** : numéro de téléphone (avec indicatif) + mot de passe.
- **Créer un compte** : nom complet, numéro, mot de passe (6 caractères
  minimum).

Un nouveau compte est créé **inactif** : il faut qu'un administrateur
l'active avant que la connexion fonctionne. Rapproche-toi de ton
administrateur après inscription.

Chaque compte est totalement isolé : tu ne vois que tes propres contacts,
jamais ceux d'un autre distributeur.

Après 4 échecs de connexion consécutifs, le compte est bloqué 15 minutes
(protection anti-piratage). Un administrateur peut débloquer immédiatement
depuis le dashboard Admin.

## 2. Le pipeline (vue "Pipeline")

C'est l'écran principal : un tableau kanban à 7 colonnes représentant les
étapes de la relation avec un contact :

1. **Nouveau Contact**
2. **Contacté**
3. **Prospect**
4. **Intéressé**
5. **En Décision**
6. **Client** / **Partenaire** (deux colonnes finales, selon le type
   d'intérêt du contact)

Chaque contact est une carte. Fais glisser une carte (ou utilise le menu
d'étape dans la fiche détail) pour la faire avancer — chaque changement
d'étape est enregistré définitivement dans son historique.

**Indicateur d'ancienneté** : la bordure d'une carte devient rouge si le
contact n'a pas bougé depuis plusieurs jours — un signal visuel pour
repérer les prospects qui stagnent.

**Colonnes repliables** : clique sur l'en-tête d'une colonne pour la
replier/déplier. Cette préférence est mémorisée sur cet appareil.

## 3. Ajouter un contact

Bouton **"+ Ajouter un contact"** en haut de l'écran. Champs :

- **Nom** (obligatoire)
- **Téléphone** : indicatif pays + numéro local, combinés automatiquement
  au format international (ex: +237677123456). Le lien WhatsApp est généré
  à partir de ce numéro.
- **Téléphone secondaire** (optionnel)
- **Pays / Ville / Quartier** (optionnels) — utile pour visualiser où se
  trouve ton réseau, notamment hors de ton pays.
- **Source** (comment tu as connu ce contact — Facebook, annuaire
  téléphonique, recommandation, etc.). Si la source est "Facebook", un
  champ **lien du profil Facebook** apparaît.
- **Prochaine relance** (date/heure) — optionnel à la création, modifiable
  ensuite.

Après ajout, la fiche détail s'ouvre automatiquement avec le bouton
**"Contacter sur WhatsApp"** prêt à l'emploi.

Sur l'app mobile (Android), un nouveau contact est aussi proposé pour
enregistrement direct dans le répertoire téléphonique de l'appareil.

## 4. La fiche détail d'un contact

Cliquer sur une carte ouvre sa fiche complète :

- **Coordonnées** modifiables (nom, téléphones, localisation, source,
  prochaine relance) — bouton "Enregistrer les coordonnées".
- **Actions d'étape** : boutons (ou menu déroulant sur mobile) pour faire
  avancer le contact dans le pipeline, avec une note optionnelle à chaque
  transition.
- **Interactions** : journal séparé de chaque prise de contact (appel,
  message, rencontre, note libre), horodaté.
- **Chronologie des étapes** : historique complet et permanent de tous les
  changements d'étape.
- **Marquer comme perdu** : archive le contact (sort du pipeline actif,
  mais reste consultable dans "Archives" — rien n'est perdu).
- **Supprimer définitivement** : à utiliser seulement pour une vraie
  erreur (doublon, mauvaise saisie) — contrairement à l'archivage, c'est
  irréversible.

## 5. Recherche et filtres

Icône loupe en haut de l'écran : recherche par nom/numéro, et filtres
combinables par pays, ville, source, et type d'intérêt. Le badge sur
l'icône indique combien de filtres sont actifs.

## 6. Relances

Chaque contact peut avoir une date de "prochaine relance". Une bannière en
haut de l'app signale les relances dues aujourd'hui (icône cloche, avec
badge de comptage). Sur l'app mobile, une **notification locale** est
programmée automatiquement à l'heure de la relance.

## 7. Statistiques

Onglet **"Statistiques"** :

- Temps médian de conversion (basé sur les contacts devenus clients ou
  partenaires), avec min/max et nombre de contacts pris en compte.
- Répartition par pays.
- Répartition par source, avec taux de conversion par source — utile pour
  savoir quelle méthode de prospection fonctionne le mieux.

## 8. Archives

Onglet **"Archives"** : liste des contacts marqués "perdu". Un contact
archivé peut être restauré à tout moment vers le pipeline actif.

## 9. Importer des contacts en masse

Menu **"⋮" → "Importer des contacts"** : accepte un fichier CSV avec les
colonnes `Name, Country Code, Phone Number, Country`.

Comportement :

- Les lignes sans nom exploitable, ou avec un numéro invalide, sont
  ignorées.
- Les doublons (dans le fichier, ou déjà présents dans ton pipeline) sont
  ignorés silencieusement — le résumé après import indique les comptes. Tu
  peux donc réimporter le même fichier sans risque de doublons.

Chaque contact importé entre avec la source "Annuaire téléphonique" et
l'étape "Contact" — à compléter ensuite au fil de la prospection.

## 10. Utilisation hors ligne (app mobile)

Sur l'app Android, la plupart des actions fonctionnent aussi sans
connexion : consultation du pipeline, ajout/modification de contacts,
changement d'étape. Un indicateur "Hors ligne" apparaît en haut de l'écran,
avec le nombre d'actions en attente de synchronisation. Dès que la
connexion revient, tout se synchronise automatiquement avec le serveur.

Certaines actions nécessitent une connexion (création de compte, import en
masse, gestion des comptes admin) — elles sont grisées en mode hors ligne.

Fais glisser vers le bas en haut du pipeline pour forcer un rafraîchissement
("pull-to-refresh").

## 11. Espace Admin (comptes administrateurs uniquement)

Onglet **"Admin"**, visible seulement si ton compte a les droits
administrateur :

- Liste de tous les comptes du système.
- Activer / désactiver un compte.
- Débloquer un compte verrouillé après échecs de connexion.
- Réinitialiser le mot de passe d'un compte (déconnecte automatiquement
  toute session active sur ce compte).

## Bon à savoir

- Un compte = un pipeline totalement isolé. Pour t'entraîner ou faire une
  démo sans polluer tes vraies données, crée un second compte de test.
- Rien n'est jamais supprimé silencieusement : l'historique des étapes et
  les contacts archivés restent consultables indéfiniment. Seule la
  suppression manuelle et volontaire d'un contact est irréversible.
