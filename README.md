# Suivi Prospection

Application de suivi de prospection pour distributeurs MLM/vente directe.
Layer 1 uniquement : pipeline en 5 etapes, historique complet, relances, et
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
- **Pipeline kanban** : 5 colonnes (Nouveau Contact -> Contacte -> Interesse ->
  En Decision -> Client/Partenaire), avec indicateur visuel d'anciennete sur
  chaque carte (bordure qui devient rouge si le contact n'a pas bouge depuis
  plusieurs jours).
- **Localisation** : pays, ville, quartier — optionnels — sur chaque contact.
  Visible directement sur la carte kanban (📍) et filtrable, pour voir en un
  coup d'oeil ou se trouve le downline hors Cameroun.
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
- Pas d'import en masse depuis Excel (a ajouter plus tard — voir note ci-dessous)
- Pas de recuperation de mot de passe oublie — en cas d'oubli, il faut
  recreer un compte pour l'instant
- Sessions stockees dans SQLite (pas un store distribue) — suffisant pour un
  seul serveur

## Compte oublie / mot de passe perdu

Pas de recuperation en libre-service pour l'instant (ca demanderait un envoi
d'email ou de SMS, donc un service tiers payant a mettre en place). En
attendant, si toi ou un downline est bloque, lance depuis le serveur :

```bash
npm run reset-password
```

Ca liste les comptes existants, demande le numero concerne et un nouveau mot
de passe, puis reinitialise — en deconnectant au passage toute session active
sur ce compte par securite. Fonctionne aussi en une commande directe :

```bash
node scripts/reset-password.js +237677123456 nouveauMotDePasse
```

**Important** : ce script n'est volontairement pas accessible depuis
l'interface web ou une route HTTP — il ne peut etre execute que par quelqu'un
ayant un acces direct au serveur (toi). C'est une securite : personne ne peut
reinitialiser un mot de passe a distance sans passer par toi.

## Note sur l'import futur

Quand tu voudras importer d'anciens prospects depuis Excel/WhatsApp, la question
a trancher sera : est-ce qu'un prospect importe (sans vraie date de creation
connue) doit compter dans le calcul du "temps median de conversion" ? Recommande :
non, ou alors avec une date de creation explicitement marquee comme "estimee"
pour ne pas fausser silencieusement la statistique.

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
└── data/            # Cree automatiquement — contient tracker.db
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
| PATCH | `/api/prospects/:id` | Modifier nom/telephone/localisation/source/relance |
| POST | `/api/prospects/:id/stage` | Transition d'etape (`{to_stage, note}`) |
| POST | `/api/prospects/:id/outcome` | Marquer produit vs partenaire |
| POST | `/api/prospects/:id/archive` | Archiver / restaurer |
| GET | `/api/prospects/:id/history` | Historique complet des etapes |
| GET/POST | `/api/prospects/:id/interactions` | Journal des interactions |
| GET | `/api/reminders` | Relances dues aujourd'hui |
| GET | `/api/stats/benchmark` | Temps median de conversion |
| GET | `/api/stats/sources` | Repartition et taux de conversion par source |
| GET | `/api/stats/countries` | Repartition et taux de conversion par pays |

Toutes les routes `/api/prospects*`, `/api/reminders`, et `/api/stats/*`
necessitent une session active (cookie), et ne retournent jamais les donnees
d'un autre utilisateur — verifie par un test d'isolation avant livraison.

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
