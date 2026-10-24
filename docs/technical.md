# Suivi Prospection — Technical Documentation

Documentation for whoever maintains or extends the code. For end-user
onboarding, see [user-guide.md](user-guide.md). The [README.md](../README.md)
remains the reference for quick install, deployment, and the full API
reference table.

## 1. Architecture overview

```
Web client (public/*.js — vanilla JS, no framework)
Android mobile client (Capacitor — static bundle of public/ + native plugins)
            │
            ▼  fetch()/JSON — session cookie (web) or Bearer token (mobile)
Express server (server.js)
            │
            ▼
Data access layer (db.js) — node:sqlite (Node 22.5+ built-in module)
            │
            ▼
SQLite file (data/tracker.db)
```

No native dependencies, no ORM, no frontend build step. Node's built-in
`node:sqlite` module removes the need for `better-sqlite3` / `node-gyp` —
the app runs anywhere Node 22.5+ runs, with no compilation step.

## 2. Repository layout

```
server.js                    Express server: middleware, API routes, auth
db.js                        SQLite schema + all data-access functions
config.js                    Centralized configuration (reads .env)
validate.js                  Incoming payload validation
errors.js                    Typed error classes (ValidationError, AuthError, ...)
google-contacts-import.js    Parsing/normalization of the Google Contacts import CSV
public/
  index.html                 UI (single page, kanban + modals)
  planning.js                Pure rules (Today view, templates, renewals), unit tested
  js/                        Frontend logic, split by area (see §6)
  offline.js                 Offline sync layer (mobile)
  style.css                  Theme
  env.js                     API_BASE_URL — the one file to edit to point the
                              mobile app at a different backend (see §7)
scripts/
  reset-password.js          CLI: manual password reset
  activate-account.js        CLI: manual account activation
  set-admin.js                CLI: grant/revoke admin rights (bootstrap)
  backup.js                  Automated backup (snapshot + offsite push)
  migrate-v2-stages.js       v1 -> v2 schema migration
  repair-fk-refs.js          One-off FK-reference repair script
tests/                       Test suite (node --test)
android/                     Capacitor/Gradle project for the Android build
deploy/                      Deployment config (reverse proxy, VPS runbook)
data/                        Created at runtime: tracker.db + backups/
```

## 3. Data model

SQLite, single file `data/tracker.db`, in **WAL** mode
(`journal_mode = WAL`, `busy_timeout = 5000`). With WAL, recent writes can
sit in `tracker.db-wal` until the next checkpoint: to back up while the
server runs, use `npm run backup` (`VACUUM INTO`), not a plain copy of
`tracker.db`.

The schema is created with `CREATE TABLE IF NOT EXISTS` at startup;
columns added since are migrated automatically by idempotent
`ALTER TABLE ... ADD COLUMN` calls (`migrateUserColumns` /
`migrateProspectColumns` in [db.js](../db.js)).

**`users`** — one account per distributor. `phone` (E.164 format) is the
unique login identifier. Password: `password_hash` + `password_salt` via
`scrypt` (Node's built-in `crypto` module, no external dependency like
bcrypt). `is_active` (defaults to 0 at signup — requires manual
activation), `is_admin`, `subscription_expires_at`, `weekly_goal` (actions
per week, statistics). The legacy `failed_login_attempts` / `locked_until`
columns are no longer read (superseded by `login_failures`).

**`login_failures`** — failed logins per (`user_id`, `ip`) pair:
`attempts`, `locked_until`. A lockout only blocks the IP that piled up the
failures, not the account's owner.

**`sessions`** — session tokens, `ON DELETE CASCADE` on `user_id`. Stored
in the database (no distributed store like Redis) — sufficient for a
single-server deployment. Expired sessions are swept on every login.

**`prospects`** — a contact's current state. `owner_id` references `users`
(`ON DELETE CASCADE`). The `stage` column is constrained by a `CHECK` to
the 7 pipeline values (`nouveau`, `contacte`, `prospect`, `interesse`,
`en_decision`, `client`, `partenaire`). `interest_type` (`produit` /
`opportunite` / `indecis`) distinguishes the two possible final outcomes.
`is_archived` is used instead of physical deletion. Other columns:
`birthday` (`YYYY-MM-DD`, 1904 = unknown year), `temperature` (`froid` /
`tiede` / `chaud`), `reorder_interval_days` (reorder reminder),
`client_ref` (idempotency key for creates replayed from the offline queue —
unique index on `(owner_id, client_ref)`). Reads add a computed
`last_purchase_at`.

**`stage_history`** — an append-only log of every stage transition.
**Important**: application code never writes `prospects.stage` directly.
It only ever inserts into `stage_history`, and a SQLite trigger
(`trg_update_stage_timestamp`) propagates `to_stage` to `prospects.stage`
(plus timestamps) automatically. This guarantees no transition can ever go
unlogged, even by a future code mistake.

**`interactions`** — a separate log of touchpoints (call/message/
meeting/note), one row per prospect per event.

**`purchases`** — a client's orders (`purchased_at`, `product`, `amount`,
`note`), `ON DELETE CASCADE` on `prospect_id`. Drive the reorder reminder
and the revenue figure in the statistics.

**`message_templates`** — per-user WhatsApp message templates (`name`,
`body`). Variables (`{prenom}`, `{nom}`, `{ville}`, `{moi}`) are filled in
client-side ([planning.js](../public/planning.js)).

Indexes on `prospects(owner_id, stage, is_archived, next_followup_at,
country)`, a composite `prospects(owner_id, is_archived,
stage_updated_at)` for the main list, and `stage_history(prospect_id,
to_stage)` — sized for the frontend's filtering and stats queries.

## 4. Authentication and authorization

- **Web**: session cookie (`session_token`, `httpOnly`, `sameSite=lax`,
  `secure` driven by `config.COOKIE_SECURE`), duration
  `SESSION_DURATION_DAYS` (30 by default).
- **Mobile (Capacitor)**: the Android app is bundled locally (bundled
  `webDir`, no `server.url`), so its origin (`http://localhost` on
  Capacitor) differs from the API's — the session cookie can't cross that
  cross-origin boundary. The server detects this specific origin
  (`NATIVE_APP_ORIGIN = 'http://localhost'`, [server.js](../server.js))
  and, only in that case, returns the session token in the login
  response's JSON body. The mobile client then sends it back as
  `Authorization: Bearer <token>` on every request. Since no cookie
  crosses the boundary, `Access-Control-Allow-Credentials` isn't needed.
- **Inactive accounts / subscription**: login fails until an admin
  activates the account (`users.is_active`) or once
  `subscription_expires_at` has passed. This check runs again **on every
  request** in `requireAuth`: deactivation or expiry also cuts off sessions
  that are already open (deactivating an account deletes its sessions).
- **Lockout**: 4 consecutive failures from one IP -> that IP is locked out
  of that account for 15 min (`login_failures`). Other IPs are unaffected.
  An admin can lift every lockout via `/api/admin/users/:id/unlock`.
- **Authorization**: every `/api/prospects*` route consistently filters by
  `owner_id = <session's user>` — no cross-account leakage (covered by an
  isolation test in `tests/`). `/api/admin/*` routes additionally require
  `is_admin = 1` (403 otherwise).

## 5. Application security

- **Helmet** with an explicit CSP ([server.js](../server.js)):
  `script-src 'self'` only, no inline scripts; `style-src` allows
  `'unsafe-inline'` (a handful of dynamic styles injected via JS, e.g. the
  kanban progress bar) plus Google Fonts.
- **Rate limiting** (`express-rate-limit`) on auth routes only —
  `RATE_LIMIT_AUTH_MAX` attempts per `RATE_LIMIT_AUTH_WINDOW_MIN` minutes,
  per IP.
- **Validation** centralized in `validate.js` — every incoming payload
  passes through it before reaching `db.js`.
- **Typed errors** (`errors.js`): `ValidationError`, `AuthError`,
  `NotFoundError`, `ConflictError` — each mapped to the appropriate HTTP
  status by `handleError()` in `server.js`. In production
  (`NODE_ENV=production`), unexpected internal errors never leak their
  details to the client (only logged server-side).
- **Body limits**: 100kb by default, 10mb specifically on
  `/api/prospects/import` (up to 5000 CSV rows).
- **`TRUST_PROXY`**: must be explicitly enabled behind a reverse proxy so
  rate limiting sees the real client IP via `X-Forwarded-For`.

## 6. Frontend

No framework, no build step. The code is split into classic scripts in
`public/js/` (`core`, `auth`, `notifications`, `shell`, `board`, `data`,
`today`, `templates`, `tabs`, `admin`, `forms`, `detail`, `init`), loaded
**in that order** by `index.html` and sharing one global scope: code that
runs at load time only sees earlier files, and `init.js` must stay last
(a test checks this). DOM-free rules live in `public/planning.js`
(tested under Node). Together they handle:

- In-memory application state (prospect list, active filters, etc.)
- Rendering the kanban board and modals (direct DOM manipulation)
- API calls via an `api()` wrapper that routes either to plain `fetch()`
  or to `OfflineSync.request()` (see `offline.js`) when running as the
  mobile app with the offline layer enabled
- Conditional Capacitor integrations (`window.Capacitor?.Plugins`):
  `LocalNotifications` (scheduling follow-up reminders), `Contacts`
  (saving a new prospect to the phone's address book)

`public/offline.js` implements offline sync on mobile: a queue of pending
actions, connectivity detection, and automatic resync when the network
returns. `updateOfflineGatedUI()` disables the UI actions that require a
live connection (account creation, bulk import, admin management).

## 7. Mobile app (Capacitor / Android)

- `capacitor.config.json`: `webDir: "public"` — the web frontend is
  bundled as-is into the APK (no `server.url`, so loading the UI itself
  has no network dependency).
- **`public/env.js`**: the single place to point the mobile app at a given
  backend environment (`API_BASE_URL`). Unlike `capacitor.config.json`,
  this value is *baked* into the bundle — changing it requires
  `npx cap sync android` **and** a full rebuild (a reload alone won't pick
  it up).
- Build: `npx cap sync android` (copies `public/` + config into the
  Android project), then Gradle (`./gradlew assembleDebug` for an
  unsigned test APK, or through Android Studio for a signed release
  build).
- Requires JDK 21 (the current Capacitor/Gradle project targets that
  bytecode level — JDK 17 fails compilation with `invalid source release:
  21`).
- Plugins in use: `@capacitor/local-notifications` (follow-up reminders),
  `@capacitor-community/contacts` (saving to the phone's address book).

### Plain-HTTP vs HTTPS environments

As long as the backend has no TLS in front of it, `capacitor.config.json`
includes `server.cleartext: true` and `server.androidScheme: "http"` to
stop the WebView from blocking mixed content (it's HTTPS by default). Once
a domain + TLS are in place, both keys should be removed (reverting to
Capacitor's defaults), `public/env.js` updated to the HTTPS URL, and the
`upgradeInsecureRequests: null` CSP override in `server.js` removed (it
exists only to stop Helmet from forcing requests to rewrite to HTTPS
before TLS actually exists).

## 8. Google Contacts import

`google-contacts-import.js` processes a `Name, Country Code, Phone Number,
Country` CSV (the format produced by an already-reworked Google Contacts
export). Deliberately conservative logic: rows with no usable name are
skipped, invalid phone numbers are skipped (validated via
`google-libphonenumber`), duplicates (within the file or already in the
database) are silently skipped and counted in the summary returned to the
frontend — making a re-import repeatable without risk.

## 9. Tests

`npm test` (= `node --test`, no external test dependency). See `tests/`,
in particular `tests/helpers.js` for fixtures, and the multi-account
isolation / lockout tests (`tests/lockout.test.js`).

## 10. Backups

`scripts/backup.js`: `VACUUM INTO` (a consistent snapshot without
stopping the server or risking a copy mid-write), gzip compression, local
pruning after `BACKUP_RETENTION_DAYS`, optional offsite push
(`rsync`/`scp`) if `BACKUP_REMOTE` is set. Meant to run via system cron,
decoupled from the Node process (see the README).

## 11. Deployment

See the [README.md](../README.md) "Deployer ailleurs qu'en local" section
for the full procedure, and [deploy/README.md](../deploy/README.md) for
the reverse proxy / TLS setup specific to the `suivipro.info` domain.

Key points:

- `data/tracker.db` must live on a persistent disk.
- The app only listens over HTTP internally — TLS is always terminated by
  an upstream reverse proxy (Caddy recommended for automatic Let's
  Encrypt certificate renewal).
- `TRUST_PROXY=true` is required as soon as a reverse proxy is in place,
  otherwise rate limiting and logging see the proxy's IP instead of the
  client's.
