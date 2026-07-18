# Suivi Prospection

Application de suivi de prospection pour distributeurs MLM/vente directe.
Layer 1 uniquement : pipeline en 7 etapes, historique complet, relances, et
benchmark de temps de conversion — pas de moteur de commissions (Layer 2, a venir).

## Demarrage rapide

Prerequis : **Node.js 22.5 ou plus recent** (utilise le module natif `node:sqlite`,
donc aucune compilation native n'est necessaire — pas de `better-sqlite3`, pas de
`node-gyp`, ca marche directement).

```bash
npm install
npm start
```

Puis ouvre **http://localhost:3000** dans le navigateur.

La base de donnees SQLite se cree automatiquement au premier lancement dans
`data/tracker.db`. Ce fichier contient toutes tes donnees — sauvegarde-le
regulierement (copier le fichier suffit, pas besoin d'export).

## Ce que l'app fait

- **Comptes multi-utilisateurs** : chaque distributeur cree son propre compte
  (numero + mot de passe) et ne voit que ses propres prospects. Mots de passe
  hashes avec `scrypt` (integre a Node, aucune dependance externe). Session
  par cookie (30 jours), stockee dans SQLite.
- **Pipeline kanban** : 7 colonnes (Nouveau Contact -> Contacte -> Prospect ->
  Interesse -> En Decision -> Client / Partenaire), avec indicateur visuel
  d'anciennete sur chaque carte (bordure qui devient rouge si le contact n'a
  pas bouge depuis plusieurs jours). Les colonnes peuvent etre repliees
  individuellement (memorise localement dans le navigateur).
- **Localisation** : pays, ville, quartier — optionnels — sur chaque contact.
  Visible directement sur la carte kanban (📍) et filtrable, pour voir en un
  coup d'oeil ou se trouve le downline hors Cameroun.
- **Profil Facebook** : lien optionnel, affiche sur la carte kanban quand la
  source du contact est "facebook".
- **Recherche et filtres** : par nom/numero, pays, ville (correspondance
  partielle), source, et type d'interet — combinables.
- **Telephone standardise (E.164)** : selecteur d'indicatif pays + numero
  local, combines automatiquement (ex: +237677123456). Le zero initial local
  ("0677...") est retire automatiquement. Le lien WhatsApp
  (`https://wa.me/<indicatif><numero>`) est genere depuis ce numero
  normalise, donc il fonctionne correctement quel que soit le pays du contact.
- **Acces direct a WhatsApp** : icone sur chaque carte, ET bouton "Contacter
  sur WhatsApp" visible en haut de la fiche detail — qui s'ouvre
  automatiquement juste apres l'ajout d'un nouveau contact.
- **Historique d'etapes** (`stage_history`) : chaque transition est enregistree
  avec date et note optionnelle — permanent. Permet de montrer a un downline
  decourage "regarde, ce contact a mis 3 semaines avant de rejoindre, c'est
  normal."
- **Interactions** : journal separe des touches (appel/message/rencontre/note)
  par prospect.
- **Relances** : une date de relance par prospect, avec bandeau d'alerte en
  haut de l'app pour les relances du jour.
- **Statistiques** : temps median de conversion (prospects convertis
  uniquement), repartition par pays, repartition par source avec taux de
  conversion.
- **Archives** ("Perdu") : sort du pipeline actif mais l'historique reste
  consultable — rien n'est jamais supprime silencieusement.

## Ce que l'app ne fait pas (volontairement, pour l'instant)

- Pas de moteur de calcul de commissions / structure de downline (Layer 2)
- Pas d'import direct depuis Excel — seulement depuis un CSV au format
  `Name, Country Code, Phone Number, Country` (voir "Importer des contacts"
  ci-dessous)
- Pas de recuperation de mot de passe **en libre-service** (pas d'email/SMS) —
  mais un administrateur peut reinitialiser le mot de passe de n'importe quel
  compte depuis le dashboard admin ou en CLI (voir ci-dessous)
- Sessions stockees dans SQLite (pas un store distribue) — suffisant pour un
  seul serveur

## Comptes admin, activation, et mot de passe oublie

Les nouveaux comptes sont crees **inactifs** : ils ne peuvent pas se connecter
tant qu'un administrateur ne les a pas actives. Le tout premier administrateur
doit etre cree en CLI (bootstrap volontairement hors HTTP, pour eviter qu'un
admin puisse en creer d'autres a distance sans garde-fou) :

```bash
node scripts/activate-account.js +237677123456   # active un compte
node scripts/set-admin.js +237677123456           # accorde les droits admin
```

Une fois qu'un compte a les droits admin, tout le reste se fait depuis
l'interface web (onglet "Admin", visible uniquement pour les administrateurs) :
lister les comptes, activer/desactiver, debloquer un compte verrouille (4
echecs de connexion consecutifs = blocage 15 minutes), et reinitialiser le mot
de passe d'un compte (deconnecte automatiquement toute session active sur ce
compte).

Le script CLI direct reste disponible aussi, pour un acces sans passer par le
web :

```bash
node scripts/reset-password.js +237677123456 nouveauMotDePasse
```

## Importer des contacts en masse (depuis Google Contacts)

Le bouton **"Importer des contacts"** (en haut de l'app) accepte un fichier
CSV avec les colonnes `Name, Country Code, Phone Number, Country` — c'est
exactement le format produit par l'outil `Google_csv_contact_to_mlm_import_format`
(export Google Contacts -> numeros valides et normalises par pays).

Le comportement est volontairement conservateur :
- Les lignes sans nom exploitable (`..`, `...`, un contact uniquement compose
  d'emojis) sont ignorees.
- Les numeros invalides sont ignores.
- Les doublons — dans le fichier lui-meme, ou deja presents dans ton
  pipeline — sont ignores silencieusement (comptes affiches dans le resume).
  Ca rend l'operation repetable : ré-importer le meme fichier (ou un export
  mis a jour) n'importe pas deux fois les memes personnes.

Chaque contact importe entre dans le pipeline avec la source "Annuaire
telephonique" et l'etape "Contact" (comme un ajout manuel) — rien d'autre
n'est pre-rempli (pas de ville/quartier/relance), a completer au fil de la
prospection.

**Note sur les statistiques** : un contact importe n'a pas de vraie date de
"premier contact" connue — sa `created_at` est la date de l'import. Si tu
importes un gros volume d'un coup, ca peut fausser temporairement le "temps
median de conversion" (Statistiques) tant que ces contacts n'ont pas encore
progresse dans le pipeline.

## Structure du projet

```
suivi-prospection/
├── server.js       # Serveur Express + toutes les routes API
├── db.js           # Schema SQLite, trigger, toutes les fonctions d'acces aux donnees
├── package.json
├── public/
│   ├── index.html  # Interface (kanban, modales, stats)
│   ├── style.css    # Theme sombre / rouge, Montserrat
│   └── app.js       # Logique frontend (aucun framework, JS natif)
├── scripts/
│   ├── reset-password.js       # Reinitialisation manuelle d'un mot de passe (CLI)
│   ├── activate-account.js     # Activation manuelle d'un compte (CLI)
│   ├── set-admin.js            # Octroi/retrait des droits admin (CLI, bootstrap)
│   ├── backup.js                # Sauvegarde automatisee (snapshot + offsite)
│   └── migrate-v2-stages.js    # Migration schema v1 -> v2 (7 etapes, profil Facebook)
├── tests/           # Suite de tests automatises (node --test)
└── data/            # Cree automatiquement — contient tracker.db et backups/
```

## Modele de donnees

Trois tables : `prospects` (etat courant), `stage_history` (journal
d'evenements, append-only), `interactions` (journal des touches). Un trigger
SQLite (`trg_update_stage_timestamp`) synchronise automatiquement
`prospects.stage` a chaque insertion dans `stage_history` — le code applicatif
n'ecrit jamais directement le champ `stage`, il insere uniquement dans
`stage_history`, ce qui garantit qu'aucune transition n'est jamais non-loggee.

## API

| Methode | Route | Description |
|---|---|---|
| POST | `/api/auth/register` | Creer un compte (`{name, phone, password}`) |
| POST | `/api/auth/login` | Connexion (`{phone, password}`) |
| POST | `/api/auth/logout` | Deconnexion |
| GET | `/api/auth/me` | Utilisateur courant (401 si non connecte) |
| GET | `/api/prospects` | Liste, filtrable : `?archived=1`, `?stage=`, `?source=`, `?interest_type=`, `?country=`, `?city=`, `?quarter=`, `?search=` |
| POST | `/api/prospects` | Creer un prospect |
| POST | `/api/prospects/import` | Import en masse (`{rows}`, format CSV Google Contacts converti) — voir "Importer des contacts" |
| GET | `/api/prospects/:id` | Detail d'un prospect |
| PATCH | `/api/prospects/:id` | Modifier nom/telephone/localisation/source/relance |
| DELETE | `/api/prospects/:id` | Supprimer definitivement (distinct de l'archivage) |
| POST | `/api/prospects/:id/stage` | Transition d'etape (`{to_stage, note}`) — le pipeline a 7 etapes, la derniere se scinde en `client` ou `partenaire` |
| POST | `/api/prospects/:id/archive` | Archiver / restaurer |
| GET | `/api/prospects/:id/history` | Historique complet des etapes |
| GET/POST | `/api/prospects/:id/interactions` | Journal des interactions |
| GET | `/api/reminders` | Relances dues aujourd'hui |
| GET | `/api/stats/benchmark` | Temps median de conversion |
| GET | `/api/stats/sources` | Repartition et taux de conversion par source |
| GET | `/api/stats/countries` | Repartition et taux de conversion par pays |
| GET | `/api/admin/users` | Liste tous les comptes (admin uniquement) |
| POST | `/api/admin/users/:id/activate` | Active/desactive un compte (`{active}`, admin uniquement) |
| POST | `/api/admin/users/:id/unlock` | Debloque un compte verrouille (admin uniquement) |
| POST | `/api/admin/users/:id/reset-password` | Reinitialise le mot de passe d'un compte (`{new_password}`, admin uniquement) |

Toutes les routes `/api/prospects*`, `/api/reminders`, et `/api/stats/*`
necessitent une session active (cookie), et ne retournent jamais les donnees
d'un autre utilisateur — verifie par un test d'isolation avant livraison. Les
routes `/api/admin/*` necessitent en plus que le compte connecte ait
`is_admin = 1` (403 sinon).

## Tester avec plusieurs comptes

Comme l'app gere maintenant plusieurs utilisateurs, pour simuler un downline :
ouvre un onglet de navigation privee (ou un autre navigateur) et cree un
deuxieme compte avec un numero different. Chaque compte a son propre pipeline,
completement isole.

## Deployer ailleurs qu'en local

L'app est un simple serveur Node/Express sans dependances natives — elle tourne
telle quelle sur n'importe quel hebergeur supportant Node 22+ (Railway, Render,
un VPS). Le seul point d'attention : `data/tracker.db` doit vivre sur un disque
persistant (pas un systeme de fichiers ephemere), sinon les donnees disparaissent
a chaque redeploiement.

### Sur un VPS (deploiement type)

1. Installe Node 22+ (ex: via [fnm](https://github.com/Schniz/fnm) ou le
   gestionnaire de paquets du systeme).
2. Clone le depot, `npm install`, copie `.env.example` vers `.env` et ajuste
   au minimum `NODE_ENV=production`, `TRUST_PROXY=true` (si derriere nginx/un
   reverse proxy), et les variables de sauvegarde (voir ci-dessous).
3. Fais tourner l'app avec un supervisor qui la relance automatiquement en cas
   de crash ou de redemarrage du serveur (`systemd`, `pm2`, ou equivalent) —
   ex. un service systemd avec `ExecStart=/usr/bin/node server.js` et
   `Restart=on-failure`.
4. Mets un reverse proxy (nginx, Caddy) devant pour le TLS/HTTPS ; l'app
   elle-meme n'ecoute qu'en HTTP en interne.
5. Cree le premier administrateur en CLI, directement sur le serveur (voir
   "Comptes admin" plus haut).

### Sauvegardes

`scripts/backup.js` prend un instantane coherent de la base (via `VACUUM INTO`
SQLite — sans arreter le serveur ni risquer de copier le fichier en pleine
ecriture), le compresse en `.db.gz`, purge les sauvegardes locales plus
vieilles que `BACKUP_RETENTION_DAYS`, puis pousse la copie hors du serveur via
`rsync`/`scp` si `BACKUP_REMOTE` est configure (voir `.env.example`).

A lancer manuellement pour tester :

```bash
node scripts/backup.js
```

En production, planifie-le via **cron systeme** (volontairement decouple du
processus Node — un crash de l'app ne doit pas arreter les sauvegardes, et
inversement) :

```cron
0 3 * * * cd /chemin/vers/mlm-tracker && /usr/bin/node scripts/backup.js >> /var/log/mlm-backup.log 2>&1
```

Prerequis pour la copie hors-site : un acces SSH par cle (sans mot de passe)
deja configure entre le VPS et la machine/le stockage de destination — c'est
une etape a faire une fois, manuellement, hors de ce projet. Si `BACKUP_REMOTE`
n'est pas defini, les sauvegardes restent locales uniquement (deconseille en
production : en cas de perte du VPS, tu perds aussi les sauvegardes).
