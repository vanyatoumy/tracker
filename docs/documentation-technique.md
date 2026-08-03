# Suivi Prospection — Documentation technique

Documentation destinée à quiconque maintient ou fait évoluer le code. Pour
la prise en main côté utilisateur final, voir
[guide-utilisateur.md](guide-utilisateur.md). Le [README.md](../README.md)
reste la référence pour l'installation rapide, le déploiement et le détail
complet de l'API.

## 1. Vue d'ensemble de l'architecture

```
Client web (public/*.js, vanilla JS, pas de framework)
Client mobile Android (Capacitor — bundle statique de public/ + plugins natifs)
            │
            ▼  fetch()/JSON — cookie de session (web) ou Bearer token (mobile)
Serveur Express (server.js)
            │
            ▼
Couche d'accès aux données (db.js) — node:sqlite (module natif Node 22.5+)
            │
            ▼
Fichier SQLite (data/tracker.db)
```

Aucune dépendance native, aucun ORM, aucun bundler côté frontend. Le module
`node:sqlite` intégré à Node élimine le besoin de `better-sqlite3` /
`node-gyp` — l'app tourne partout où Node 22.5+ tourne, sans étape de
compilation.

## 2. Structure du dépôt

```
server.js                    Serveur Express : middlewares, routes API, auth
db.js                        Schéma SQLite + toutes les fonctions d'accès aux données
config.js                    Configuration centralisée (lit .env)
validate.js                  Validation des payloads entrants
errors.js                    Classes d'erreur typées (ValidationError, AuthError, ...)
google-contacts-import.js    Parsing/normalisation du CSV d'import Google Contacts
public/
  index.html                 Interface (une seule page, kanban + modales)
  app.js                     Logique frontend (état, rendu, appels API)
  offline.js                 Couche de synchronisation hors-ligne (mobile)
  style.css                  Thème
  env.js                     API_BASE_URL — seul fichier à éditer pour changer
                              d'environnement cible côté mobile (voir §7)
scripts/
  reset-password.js          CLI : réinitialisation manuelle d'un mot de passe
  activate-account.js        CLI : activation manuelle d'un compte
  set-admin.js                CLI : octroi/retrait des droits admin (bootstrap)
  backup.js                  Sauvegarde automatisée (snapshot + push offsite)
  migrate-v2-stages.js       Migration de schéma v1 -> v2
  repair-fk-refs.js          Script de réparation ponctuelle de références
tests/                       Suite de tests (node --test)
android/                     Projet Capacitor/Gradle pour le build Android
deploy/                      Config de déploiement (reverse proxy, runbook VPS)
data/                        Créé au runtime : tracker.db + backups/
```

## 3. Modèle de données

Quatre tables (SQLite, fichier unique `data/tracker.db`) :

**`users`** — un compte par distributeur. `phone` (format E.164) sert
d'identifiant de connexion, unique. Mot de passe : `password_hash` +
`password_salt` via `scrypt` (module `crypto` natif, pas de dépendance
externe type bcrypt). `is_active` (0 par défaut à l'inscription — activation
manuelle requise), `is_admin`, `failed_login_attempts` / `locked_until`
pour le verrouillage anti-brute-force.

**`sessions`** — jetons de session, `ON DELETE CASCADE` sur `user_id`.
Stockées en base (pas de store distribué type Redis) — suffisant pour un
serveur unique.

**`prospects`** — état courant d'un contact. `owner_id` référence `users`
(`ON DELETE CASCADE`). Champ `stage` contraint par un `CHECK` aux 7 valeurs
du pipeline (`nouveau`, `contacte`, `prospect`, `interesse`, `en_decision`,
`client`, `partenaire`). `interest_type` (`produit` / `opportunite` /
`indecis`) distingue les deux issues finales possibles. `is_archived`
plutôt qu'une suppression physique.

**`stage_history`** — journal append-only de toute transition d'étape.
**Important** : le code applicatif n'écrit jamais directement
`prospects.stage`. Il insère uniquement dans `stage_history`, et un
trigger SQLite (`trg_update_stage_timestamp`) répercute automatiquement
`to_stage` vers `prospects.stage` (+ timestamps). Ça garantit qu'aucune
transition n'est jamais non journalisée, même par erreur de code futur.

**`interactions`** — journal séparé des touches (appel/message/
rencontre/note), un enregistrement par prospect et par événement.

Index sur `prospects(owner_id, stage, is_archived, next_followup_at,
country)` et sur `stage_history(prospect_id, to_stage)` — dimensionnés pour
les requêtes de filtrage et de stats du frontend.

## 4. Authentification et autorisation

- **Web** : cookie de session (`session_token`, `httpOnly`, `sameSite=lax`,
  `secure` piloté par `config.COOKIE_SECURE`), durée
  `SESSION_DURATION_DAYS` (30 par défaut).
- **Mobile (Capacitor)** : l'app Android est empaquetée localement
  (`webDir` bundlé, pas de `server.url`), donc son origine
  (`http://localhost` côté Capacitor) est distincte de celle de l'API — le
  cookie de session ne traverse pas cette frontière cross-origin. Le
  serveur détecte cette origine spécifique
  (`NATIVE_APP_ORIGIN = 'http://localhost'`, [server.js](../server.js))
  et, dans ce cas uniquement, renvoie le jeton de session dans le corps
  JSON de la réponse de login. Le client mobile l'envoie ensuite en
  `Authorization: Bearer <token>` sur chaque requête. Comme aucun cookie ne
  traverse la frontière, `Access-Control-Allow-Credentials` n'est pas
  nécessaire.
- **Comptes inactifs** : le login échoue tant qu'un admin n'a pas activé
  le compte (`users.is_active`).
- **Verrouillage** : 4 échecs consécutifs -> `locked_until` = maintenant +
  15 min. Un admin peut débloquer via `/api/admin/users/:id/unlock`.
- **Autorisation** : chaque route `/api/prospects*` filtre systématiquement
  par `owner_id = <utilisateur de la session>` — jamais de fuite
  inter-comptes (couvert par un test d'isolation dans `tests/`). Les routes
  `/api/admin/*` exigent en plus `is_admin = 1` (403 sinon).

## 5. Sécurité applicative

- **Helmet** avec CSP explicite ([server.js](../server.js)) :
  `script-src 'self'` uniquement, pas de script inline ; `style-src`
  autorise `'unsafe-inline'` (quelques styles dynamiques injectés en JS,
  ex. la barre de progression kanban) et Google Fonts.
- **Rate limiting** (`express-rate-limit`) sur les routes d'auth
  uniquement — `RATE_LIMIT_AUTH_MAX` tentatives par
  `RATE_LIMIT_AUTH_WINDOW_MIN` minutes et par IP.
- **Validation** centralisée dans `validate.js` — tous les payloads entrants
  y passent avant d'atteindre `db.js`.
- **Erreurs typées** (`errors.js`) : `ValidationError`, `AuthError`,
  `NotFoundError`, `ConflictError` — chacune mappée à un code HTTP
  approprié par `handleError()` dans `server.js`. En production
  (`NODE_ENV=production`), les erreurs internes non prévues ne renvoient
  jamais leur détail au client (juste loggées côté serveur).
- **Body limits** : 100kb par défaut, 10mb spécifiquement sur
  `/api/prospects/import` (jusqu'à 5000 lignes CSV).
- **`TRUST_PROXY`** : à activer explicitement derrière un reverse proxy
  pour que le rate limiting voie la vraie IP cliente via
  `X-Forwarded-For`.

## 6. Frontend

Pas de framework, pas de build step. `public/app.js` gère :

- L'état applicatif en mémoire (liste des prospects, filtres actifs, etc.)
- Le rendu du kanban et des modales (manipulation directe du DOM)
- Les appels API via un wrapper `api()` qui route soit vers `fetch()`
  classique, soit vers `OfflineSync.request()` (voir `offline.js`) quand
  l'app tourne en mode mobile avec la couche offline activée
- Les intégrations Capacitor conditionnelles (`window.Capacitor?.Plugins`) :
  `LocalNotifications` (programmation des rappels de relance),
  `Contacts` (enregistrement d'un nouveau prospect dans le répertoire du
  téléphone)

`public/offline.js` implémente la synchronisation hors-ligne côté mobile :
file d'attente d'actions en attente, détection de connectivité, et
resynchronisation automatique au retour du réseau. `updateOfflineGatedUI()`
désactive dans l'UI les actions qui exigent une connexion (création de
compte, import en masse, administration).

## 7. Application mobile (Capacitor / Android)

- `capacitor.config.json` : `webDir: "public"` — le frontend web est
  empaqueté tel quel dans l'APK (pas de `server.url`, donc pas de
  dépendance réseau pour charger l'UI elle-même).
- **`public/env.js`** : seul et unique endroit où pointer l'app mobile
  vers un environnement backend donné (`API_BASE_URL`). Contrairement à
  `capacitor.config.json`, cette valeur est *baked* dans le bundle — un
  changement nécessite `npx cap sync android` **et** une reconstruction
  complète (un simple reload ne suffit pas).
- Build : `npx cap sync android` (copie `public/` + config vers le projet
  Android) puis Gradle (`./gradlew assembleDebug` pour un APK de test non
  signé, ou via Android Studio pour un build release signé).
- Nécessite JDK 21 (le projet Capacitor/Gradle actuel cible ce niveau de
  bytecode — JDK 17 échoue à la compilation avec `invalid source release:
  21`).
- Plugins utilisés : `@capacitor/local-notifications` (rappels de
  relance), `@capacitor-community/contacts` (ajout au répertoire
  téléphonique).

### Environnement plain-HTTP vs HTTPS

Tant que le backend n'a pas de TLS devant lui, `capacitor.config.json`
inclut `server.cleartext: true` et `server.androidScheme: "http"` pour
éviter que la WebView bloque le contenu mixte (elle est HTTPS par défaut).
Une fois un domaine + TLS en place, ces deux clés doivent être retirées
(retour au comportement par défaut de Capacitor), `public/env.js` mis à
jour vers l'URL HTTPS, et l'override de CSP `upgradeInsecureRequests: null`
dans `server.js` supprimé (il n'est là que pour éviter que Helmet ne force
la réécriture des requêtes en HTTPS avant que TLS n'existe réellement).

## 8. Import Google Contacts

`google-contacts-import.js` traite un CSV `Name, Country Code, Phone
Number, Country` (format produit par un export Google Contacts déjà
retravaillé). Logique volontairement conservatrice : lignes sans nom
exploitable ignorées, numéros invalides ignorés (validation via
`google-libphonenumber`), doublons (dans le fichier ou déjà en base)
ignorés silencieusement et comptés dans le résumé retourné au frontend —
ce qui rend un ré-import répétable sans risque.

## 9. Tests

`npm test` (= `node --test`, aucune dépendance de test externe). Voir
`tests/`, notamment `tests/helpers.js` pour les fixtures, et les tests
d'isolation multi-comptes / de verrouillage
(`tests/lockout.test.js`).

## 10. Sauvegardes

`scripts/backup.js` : `VACUUM INTO` (snapshot cohérent sans arrêter le
serveur ni risque de copie en écriture concurrente), compression gzip,
purge locale après `BACKUP_RETENTION_DAYS`, push offsite optionnel
(`rsync`/`scp`) si `BACKUP_REMOTE` est défini. Prévu pour tourner via cron
système, découplé du process Node (voir README).

## 11. Déploiement

Voir le [README.md](../README.md) section "Déployer ailleurs qu'en local"
pour la procédure complète, et [deploy/README.md](../deploy/README.md)
pour la mise en place spécifique du reverse proxy / TLS sur le domaine
`suivipro.info`.

Points clés :

- `data/tracker.db` doit vivre sur un disque persistant.
- L'app n'écoute qu'en HTTP en interne — TLS est toujours terminé par un
  reverse proxy en amont (Caddy recommandé pour le renouvellement
  automatique des certificats Let's Encrypt).
- `TRUST_PROXY=true` est nécessaire dès qu'un reverse proxy est en place,
  sinon le rate limiting et les logs voient l'IP du proxy plutôt que celle
  du client.
