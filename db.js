const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { randomUUID } = crypto;
const config = require('./config');
const { NotFoundError, ConflictError, ValidationError } = require('./errors');

const DB_PATH = config.DB_PATH;
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON;');
// WAL: readers don't block on a writer (or on a backup's VACUUM INTO) and
// vice versa. busy_timeout: when another connection (a CLI script, the
// backup job) holds the write lock, wait up to 5s instead of failing
// straight away with SQLITE_BUSY. Note that with WAL, recent writes may sit
// in tracker.db-wal until the next checkpoint — copy the database with
// scripts/backup.js (VACUUM INTO), not by copying the .db file alone.
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA busy_timeout = 5000;');

// ============================================
// SCHEMA
// ============================================
db.exec(`
CREATE TABLE IF NOT EXISTS users (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    phone           TEXT NOT NULL UNIQUE,   -- E.164, used as login identifier
    password_hash   TEXT NOT NULL,
    password_salt   TEXT NOT NULL,
    is_active       INTEGER NOT NULL DEFAULT 1,
    is_admin        INTEGER NOT NULL DEFAULT 0,
    failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until    TEXT,
    subscription_expires_at TEXT,          -- NULL until first admin activation
    created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    token           TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    expires_at      TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS prospects (
    id              TEXT PRIMARY KEY,
    owner_id        TEXT NOT NULL,
    name            TEXT NOT NULL,
    phone           TEXT,                    -- E.164 format, e.g. +237677123456
    alt_phone       TEXT,                    -- optional second number for the same person (E.164)
    country         TEXT,
    city            TEXT,
    quarter         TEXT,
    facebook_profile_url TEXT,               -- only meaningful when source = 'facebook'
    stage           TEXT NOT NULL CHECK (stage IN (
                        'nouveau', 'contacte', 'prospect', 'interesse',
                        'en_decision', 'client', 'partenaire'
                    )),
    stage_updated_at TEXT NOT NULL,
    source          TEXT,
    interest_type   TEXT CHECK (interest_type IN ('produit', 'opportunite', 'indecis') OR interest_type IS NULL),
    is_archived     INTEGER NOT NULL DEFAULT 0,
    next_followup_at TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_prospects_owner ON prospects(owner_id);
CREATE INDEX IF NOT EXISTS idx_prospects_stage ON prospects(stage);
CREATE INDEX IF NOT EXISTS idx_prospects_archived ON prospects(is_archived);
CREATE INDEX IF NOT EXISTS idx_prospects_followup ON prospects(next_followup_at);
CREATE INDEX IF NOT EXISTS idx_prospects_country ON prospects(country);
-- The board / today list query: one owner's active contacts, newest stage
-- change first — served by this index alone, no separate sort.
CREATE INDEX IF NOT EXISTS idx_prospects_owner_active ON prospects(owner_id, is_archived, stage_updated_at);

CREATE TABLE IF NOT EXISTS stage_history (
    id              TEXT PRIMARY KEY,
    prospect_id     TEXT NOT NULL,
    from_stage      TEXT,
    to_stage        TEXT NOT NULL,
    changed_at      TEXT NOT NULL,
    note            TEXT,
    FOREIGN KEY (prospect_id) REFERENCES prospects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_stage_history_prospect ON stage_history(prospect_id);
CREATE INDEX IF NOT EXISTS idx_stage_history_to_stage ON stage_history(to_stage);

CREATE TABLE IF NOT EXISTS interactions (
    id              TEXT PRIMARY KEY,
    prospect_id     TEXT NOT NULL,
    type            TEXT NOT NULL CHECK (type IN ('appel', 'message', 'rencontre', 'note')),
    content         TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    FOREIGN KEY (prospect_id) REFERENCES prospects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_interactions_prospect ON interactions(prospect_id);

-- Reusable WhatsApp message texts, per user. Variables like {prenom} are
-- filled in client-side when the message is sent (see public/planning.js).
CREATE TABLE IF NOT EXISTS message_templates (
    id              TEXT PRIMARY KEY,
    owner_id        TEXT NOT NULL,
    name            TEXT NOT NULL,
    body            TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_message_templates_owner ON message_templates(owner_id);

-- What a client bought and when. Drives the reorder reminder: the next
-- reorder is due reorder_interval_days (on the prospect) after the latest
-- purchase.
CREATE TABLE IF NOT EXISTS purchases (
    id              TEXT PRIMARY KEY,
    prospect_id     TEXT NOT NULL,
    purchased_at    TEXT NOT NULL,
    product         TEXT,
    amount          REAL,
    note            TEXT,
    created_at      TEXT NOT NULL,
    FOREIGN KEY (prospect_id) REFERENCES prospects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_purchases_prospect ON purchases(prospect_id);

-- Messages users send from the app ("Donner mon avis"): problems, feature
-- ideas, questions. Listed in the admin view, where they're answered on
-- WhatsApp and marked handled.
CREATE TABLE IF NOT EXISTS feedback (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    type            TEXT NOT NULL CHECK (type IN ('probleme', 'idee', 'question', 'autre')),
    message         TEXT NOT NULL,
    platform        TEXT,                    -- 'web' | 'android'
    app_version     TEXT,
    status          TEXT NOT NULL DEFAULT 'nouveau' CHECK (status IN ('nouveau', 'traite')),
    created_at      TEXT NOT NULL,
    handled_at      TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status, created_at);

-- Failed-login tracking per (account, client IP). Locking per account alone
-- let anyone who knew a phone number keep its owner locked out forever just
-- by sending 4 wrong passwords every 15 minutes; scoped per IP, an attacker
-- only locks themselves out, while the owner's own device keeps working.
-- Supersedes users.failed_login_attempts / users.locked_until (kept in the
-- table for old databases, no longer read).
CREATE TABLE IF NOT EXISTS login_failures (
    user_id         TEXT NOT NULL,
    ip              TEXT NOT NULL,
    attempts        INTEGER NOT NULL DEFAULT 0,
    locked_until    TEXT,
    PRIMARY KEY (user_id, ip),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TRIGGER IF NOT EXISTS trg_update_stage_timestamp
AFTER INSERT ON stage_history
BEGIN
    UPDATE prospects
    SET stage = NEW.to_stage,
        stage_updated_at = NEW.changed_at,
        updated_at = NEW.changed_at
    WHERE id = NEW.prospect_id;
END;
`);

// ---- Lightweight additive migration for existing databases ----
// CREATE TABLE IF NOT EXISTS above only applies to brand-new databases; a
// live DB created before the columns existed needs them added explicitly.
// These are plain ADD COLUMN calls (not a rename), so they don't trigger the
// FK/trigger rewrite issue that bit the v2 stage migration.
(function migrateUserColumns() {
    const cols = db.prepare(`PRAGMA table_info(users)`).all().map(c => c.name);
    if (!cols.includes('is_active')) {
        // Default existing accounts to active — this flag only gates *newly
        // registered* accounts going forward; nobody who could already log
        // in should be locked out by adding the column.
        db.exec(`ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;`);
    }
    if (!cols.includes('is_admin')) {
        db.exec(`ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;`);
    }
    if (!cols.includes('failed_login_attempts')) {
        db.exec(`ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER NOT NULL DEFAULT 0;`);
    }
    if (!cols.includes('locked_until')) {
        db.exec(`ALTER TABLE users ADD COLUMN locked_until TEXT;`);
    }
    if (!cols.includes('subscription_expires_at')) {
        db.exec(`ALTER TABLE users ADD COLUMN subscription_expires_at TEXT;`);
    }
    if (!cols.includes('is_trial')) {
        // 1 while the account runs on its free trial (see startTrial); back
        // to 0 at the first paid activation.
        db.exec(`ALTER TABLE users ADD COLUMN is_trial INTEGER NOT NULL DEFAULT 0;`);
    }
    if (!cols.includes('renewal_reminded_at')) {
        // When an admin last sent this user a renewal reminder (admin view).
        db.exec(`ALTER TABLE users ADD COLUMN renewal_reminded_at TEXT;`);
    }
    if (!cols.includes('weekly_goal')) {
        // Target number of actions (messages, calls, meetings) per week; NULL = no goal set.
        db.exec(`ALTER TABLE users ADD COLUMN weekly_goal INTEGER;`);
    }
})();

(function migrateProspectColumns() {
    const cols = db.prepare(`PRAGMA table_info(prospects)`).all().map(c => c.name);
    if (!cols.includes('alt_phone')) {
        db.exec(`ALTER TABLE prospects ADD COLUMN alt_phone TEXT;`);
    }
    if (!cols.includes('reorder_interval_days')) {
        // NULL = no reorder reminder for this contact.
        db.exec(`ALTER TABLE prospects ADD COLUMN reorder_interval_days INTEGER;`);
    }
    if (!cols.includes('birthday')) {
        // 'YYYY-MM-DD' (the year may be a placeholder; only month/day drive the reminder).
        db.exec(`ALTER TABLE prospects ADD COLUMN birthday TEXT;`);
    }
    if (!cols.includes('client_ref')) {
        // Idempotency key for creates replayed from the mobile offline queue
        // (its temporary "offline-..." id) — see createProspect.
        db.exec(`ALTER TABLE prospects ADD COLUMN client_ref TEXT;`);
    }
    if (!cols.includes('temperature')) {
        // How warm the rep feels the contact is: 'froid' | 'tiede' | 'chaud' | NULL.
        // Validated in server.js rather than a CHECK, which ALTER TABLE can't add.
        db.exec(`ALTER TABLE prospects ADD COLUMN temperature TEXT;`);
    }
    // Created here, after the column is guaranteed to exist on old databases.
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_prospects_client_ref ON prospects(owner_id, client_ref) WHERE client_ref IS NOT NULL;`);
})();

const STAGES = ['nouveau', 'contacte', 'prospect', 'interesse', 'en_decision', 'client', 'partenaire'];
const FAILED_LOGIN_LOCK_THRESHOLD = 4; // lock the account after this many consecutive failures
const LOCKOUT_DURATION_MIN = 15;
const INTEREST_TYPES = ['produit', 'opportunite', 'indecis'];
const TEMPERATURES = ['froid', 'tiede', 'chaud'];
const INTERACTION_TYPES = ['appel', 'message', 'rencontre', 'note'];

function now() {
    return new Date().toISOString();
}

// ============================================
// AUTH: password hashing (built-in crypto, no native deps)
// ============================================
function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return { salt, hash };
}

function verifyPassword(password, salt, expectedHash) {
    const testHash = crypto.scryptSync(password, salt, 64).toString('hex');
    const a = Buffer.from(testHash, 'hex');
    const b = Buffer.from(expectedHash, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

// ============================================
// USERS
// ============================================
function createUser({ name, phone, password }) {
    const existing = db.prepare(`SELECT id FROM users WHERE phone = ?`).get(phone);
    if (existing) throw new ConflictError('Un compte existe deja avec ce numero');

    const id = randomUUID();
    const { salt, hash } = hashPassword(password);
    // New accounts start inactive — there's no admin dashboard yet, so
    // activation happens directly against the DB (see scripts/activate-account.js).
    // Until activated, login is blocked (see login route in server.js).
    db.prepare(`
        INSERT INTO users (id, name, phone, password_hash, password_salt, is_active, created_at)
        VALUES (?, ?, ?, ?, ?, 0, ?)
    `).run(id, name, phone, hash, salt, now());

    return { id, name, phone, is_active: 0 };
}

function findUserByPhone(phone) {
    return db.prepare(`SELECT * FROM users WHERE phone = ?`).get(phone);
}

function getUserById(id) {
    return db.prepare(`SELECT id, name, phone, is_active, is_admin, is_trial, subscription_expires_at, weekly_goal, created_at FROM users WHERE id = ?`).get(id);
}

function listAllUsers() {
    return db.prepare(`SELECT id, name, phone, is_active, is_admin, subscription_expires_at, created_at FROM users ORDER BY created_at ASC`).all();
}

// Fuller view for the admin API — includes lockout state, which regular
// listAllUsers() (also used by the CLI scripts) doesn't need to show.
// Lockouts are per (account, IP) — see login_failures — so locked_until here
// is the latest one still in force across all IPs, i.e. "someone is being
// locked out of this account somewhere".
function adminListUsers() {
    return db.prepare(`
        SELECT id, name, phone, is_active, is_admin, is_trial, subscription_expires_at, renewal_reminded_at, created_at,
            (SELECT COALESCE(SUM(attempts), 0) FROM login_failures lf WHERE lf.user_id = users.id) AS failed_login_attempts,
            (SELECT MAX(locked_until) FROM login_failures lf WHERE lf.user_id = users.id AND lf.locked_until > ?) AS locked_until
        FROM users ORDER BY created_at ASC
    `).all(now());
}

// The admin sent this user a renewal reminder (WhatsApp, opened from the
// admin view) — recorded so the same person isn't chased twice by mistake.
function markRenewalReminded(userId) {
    const user = db.prepare(`SELECT id FROM users WHERE id = ?`).get(userId);
    if (!user) throw new NotFoundError('Compte introuvable');
    const ts = now();
    db.prepare(`UPDATE users SET renewal_reminded_at = ? WHERE id = ?`).run(ts, userId);
    return { id: userId, renewal_reminded_at: ts };
}

// Admin-only: reset a user's password directly (used by scripts/reset-password.js,
// not exposed via any HTTP route). Also invalidates all existing sessions for that
// user, so a lost/compromised password can't still be used via an old session cookie.
function resetPasswordByPhone(phone, newPassword) {
    const user = findUserByPhone(phone);
    if (!user) throw new NotFoundError(`Aucun compte trouve pour le numero ${phone}`);

    const { salt, hash } = hashPassword(newPassword);
    db.prepare(`UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?`).run(hash, salt, user.id);
    clearAllFailedLogins(user.id);
    deleteSessionsForUser(user.id);

    return { id: user.id, name: user.name, phone: user.phone };
}

// Bootstrap-only: grant/revoke admin rights directly (used by
// scripts/set-admin.js). There's no HTTP route for this — an admin can't be
// allowed to mint other admins over the network without a lot more care
// (audit trail, confirmation step, etc.), and right now we just need a way
// to create the first admin at all, since is_admin defaults to 0 for everyone.
function setUserAdmin(phone, isAdmin) {
    const user = findUserByPhone(phone);
    if (!user) throw new NotFoundError(`Aucun compte trouve pour le numero ${phone}`);
    db.prepare(`UPDATE users SET is_admin = ? WHERE id = ?`).run(isAdmin ? 1 : 0, user.id);
    return { id: user.id, name: user.name, phone: user.phone, is_admin: isAdmin ? 1 : 0 };
}

// There's no payment gateway — a user pays out-of-band and an admin
// activates the account manually, once, per subscription period. Every
// activation (new account or renewal — same "Activer" action) grants a
// fresh SUBSCRIPTION_DURATION_DAYS window from *now*, not from any previous
// expiry, so a lapsed renewal doesn't accumulate unpaid days.
function subscriptionExpiryFromNow() {
    return new Date(Date.now() + config.SUBSCRIPTION_DURATION_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

// Admin-only: activate/deactivate a user directly (used by
// scripts/activate-account.js, not exposed via any HTTP route).
function setUserActive(phone, active) {
    const user = findUserByPhone(phone);
    if (!user) throw new NotFoundError(`Aucun compte trouve pour le numero ${phone}`);
    return setUserActiveById(user.id, active);
}

// ---- id-based variants used by the admin HTTP API (server.js) ----
// The CLI scripts use the phone-based versions above since an operator at a
// terminal knows the phone number, not the internal id; the admin API
// operates on ids returned by adminListUsers().
function setUserActiveById(userId, active) {
    const user = db.prepare(`SELECT id, name, phone, subscription_expires_at FROM users WHERE id = ?`).get(userId);
    if (!user) throw new NotFoundError('Compte introuvable');
    const expiresAt = active ? subscriptionExpiryFromNow() : user.subscription_expires_at;
    db.prepare(`UPDATE users SET is_active = ?, subscription_expires_at = ? WHERE id = ?`).run(active ? 1 : 0, expiresAt, userId);
    // An admin activation is a paid period: it ends any free trial.
    if (active) db.prepare(`UPDATE users SET is_trial = 0 WHERE id = ?`).run(userId);
    if (active) {
        // Activating a previously-blocked account should also clear any
        // lockout left over from failed attempts, so it isn't immediately
        // re-blocked.
        clearAllFailedLogins(userId);
    } else {
        // Deactivation must take effect now, not whenever the user's
        // existing sessions happen to expire (up to SESSION_DURATION_DAYS).
        deleteSessionsForUser(userId);
    }
    return { id: user.id, name: user.name, phone: user.phone, is_active: active ? 1 : 0, subscription_expires_at: expiresAt };
}

// Free trial for a new sign-up (config.FREE_TRIAL_DAYS): active right away,
// expiring after `days` days — the same expiry / grace / renewal path as a
// paid period, just flagged is_trial so the wording can say "essai".
function startTrial(userId, days) {
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    db.prepare(`UPDATE users SET is_active = 1, is_trial = 1, subscription_expires_at = ? WHERE id = ?`).run(expiresAt, userId);
    return getUserById(userId);
}

function unlockUserById(userId) {
    const user = db.prepare(`SELECT id, name, phone FROM users WHERE id = ?`).get(userId);
    if (!user) throw new NotFoundError('Compte introuvable');
    clearAllFailedLogins(userId);
    return { id: user.id, name: user.name, phone: user.phone };
}

// Admin-assisted reset, exposed via POST /api/admin/users/:id/reset-password.
// Same effect as resetPasswordByPhone (also invalidates existing sessions,
// also clears any lockout so the new password can actually be used right
// away) — just addressed by id since that's what the admin API works with.
function resetPasswordById(userId, newPassword) {
    const user = db.prepare(`SELECT id, name, phone FROM users WHERE id = ?`).get(userId);
    if (!user) throw new NotFoundError('Compte introuvable');

    const { salt, hash } = hashPassword(newPassword);
    db.prepare(`UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?`).run(hash, salt, userId);
    clearAllFailedLogins(userId);
    deleteSessionsForUser(userId);

    return { id: user.id, name: user.name, phone: user.phone };
}

// ---- failed-login lockout, per (account, IP) — see login_failures ----

// Returns the ISO timestamp this account is locked until *for this IP*, or
// null if that IP may try a password right now.
function getLoginLockedUntil(userId, ip) {
    const row = db.prepare(`SELECT locked_until FROM login_failures WHERE user_id = ? AND ip = ?`).get(userId, ip);
    if (!row || !row.locked_until) return null;
    return new Date(row.locked_until) > new Date() ? row.locked_until : null;
}

// Called on every failed password check. Once an IP hits
// FAILED_LOGIN_LOCK_THRESHOLD consecutive failures on an account, that IP is
// locked out of that account for LOCKOUT_DURATION_MIN minutes and its
// counter resets.
function registerFailedLogin(userId, ip) {
    const row = db.prepare(`SELECT attempts FROM login_failures WHERE user_id = ? AND ip = ?`).get(userId, ip);
    const attempts = (row?.attempts || 0) + 1;
    const locked = attempts >= FAILED_LOGIN_LOCK_THRESHOLD;
    const lockedUntil = locked ? new Date(Date.now() + LOCKOUT_DURATION_MIN * 60 * 1000).toISOString() : null;
    db.prepare(`
        INSERT INTO login_failures (user_id, ip, attempts, locked_until) VALUES (?, ?, ?, ?)
        ON CONFLICT (user_id, ip) DO UPDATE SET attempts = excluded.attempts, locked_until = excluded.locked_until
    `).run(userId, ip, locked ? 0 : attempts, lockedUntil);
    return locked
        ? { locked: true, lockedUntil }
        : { locked: false, attemptsRemaining: FAILED_LOGIN_LOCK_THRESHOLD - attempts };
}

// A successful login only clears that IP's counter — lockouts other IPs
// earned on this account (e.g. an attacker's) stay in force.
function clearFailedLogins(userId, ip) {
    db.prepare(`DELETE FROM login_failures WHERE user_id = ? AND ip = ?`).run(userId, ip);
}

// Admin unlock / activation / password reset: wipe every IP's lockout.
function clearAllFailedLogins(userId) {
    db.prepare(`DELETE FROM login_failures WHERE user_id = ?`).run(userId);
}

// ============================================
// SESSIONS
// ============================================
const SESSION_DURATION_DAYS = config.SESSION_DURATION_DAYS;

function createSession(userId) {
    const token = crypto.randomBytes(32).toString('hex');
    const ts = now();
    const expires = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    db.prepare(`
        INSERT INTO sessions (token, user_id, created_at, expires_at)
        VALUES (?, ?, ?, ?)
    `).run(token, userId, ts, expires);
    // getSession() only removes an expired session if its token is used
    // again, which a lost phone or a cleared browser never does — sweep the
    // rest here, once per login, so the table doesn't grow forever.
    db.prepare(`DELETE FROM sessions WHERE expires_at < ?`).run(ts);
    return { token, expires_at: expires };
}

function getSession(token) {
    const session = db.prepare(`SELECT * FROM sessions WHERE token = ?`).get(token);
    if (!session) return null;
    if (new Date(session.expires_at) < new Date()) {
        db.prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
        return null;
    }
    return session;
}

function deleteSession(token) {
    db.prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
}

function deleteSessionsForUser(userId) {
    db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(userId);
}

// ============================================
// PROSPECTS
// ============================================
// client_ref (optional): set by the mobile app when replaying a contact
// created offline. If the server already created it — the response was lost
// on a flaky connection, so the phone retries — the existing contact is
// returned instead of creating a duplicate.
function createProspect(ownerId, { name, phone, alt_phone, country, city, quarter, facebook_profile_url, source, interest_type, next_followup_at, client_ref }) {
    if (client_ref) {
        const existing = db.prepare(`SELECT id FROM prospects WHERE owner_id = ? AND client_ref = ?`).get(ownerId, client_ref);
        if (existing) return getProspect(ownerId, existing.id);
    }

    const id = randomUUID();
    const ts = now();

    // Wrapped in a transaction: without this, a failure on the second
    // INSERT (e.g. a trigger error) leaves an orphaned prospect row with no
    // stage_history entry — the two must succeed or fail together.
    db.exec('BEGIN IMMEDIATE;');
    try {
        db.prepare(`
            INSERT INTO prospects (id, owner_id, name, phone, alt_phone, country, city, quarter, facebook_profile_url, stage, stage_updated_at,
                                    source, interest_type, is_archived, next_followup_at, client_ref, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'nouveau', ?, ?, ?, 0, ?, ?, ?, ?)
        `).run(id, ownerId, name, phone || null, alt_phone || null, country || null, city || null, quarter || null, facebook_profile_url || null,
               ts, source || null, interest_type || null, next_followup_at || null, client_ref || null, ts, ts);

        db.prepare(`
            INSERT INTO stage_history (id, prospect_id, from_stage, to_stage, changed_at, note)
            VALUES (?, ?, NULL, 'nouveau', ?, NULL)
        `).run(randomUUID(), id, ts);

        db.exec('COMMIT;');
    } catch (err) {
        db.exec('ROLLBACK;');
        throw err;
    }

    return getProspect(ownerId, id);
}

// Bulk-inserts prospects (used by the CSV contact import). Contacts are
// expected to already be validated (valid E.164 phone, non-junk name) by the
// caller — this function's only extra responsibility is deduplication:
// - within the batch itself (two rows with the same phone)
// - against phones the owner already has in their pipeline
// Both cases are silently skipped and counted, not treated as errors, since
// re-running the same import (e.g. an updated contacts export) is expected
// to be a normal, repeatable operation.
function bulkImportProspects(ownerId, contacts) {
    // Dedup is checked against every number already on file for this owner,
    // whether it's someone's primary or secondary phone — a number that's
    // already reachable through one contact shouldn't create another.
    const existing = new Set();
    for (const r of db.prepare(`SELECT phone, alt_phone FROM prospects WHERE owner_id = ?`).all(ownerId)) {
        if (r.phone) existing.add(r.phone);
        if (r.alt_phone) existing.add(r.alt_phone);
    }

    let imported = 0;
    let skippedDuplicate = 0;

    db.exec('BEGIN IMMEDIATE;');
    try {
        for (const c of contacts) {
            // The primary phone colliding means this person is already in the
            // pipeline — skip the whole contact, same as before.
            if (existing.has(c.phone)) {
                skippedDuplicate++;
                continue;
            }
            // A colliding secondary number doesn't disqualify the contact —
            // just drop that one number rather than losing the whole person.
            const altPhone = (c.alt_phone && !existing.has(c.alt_phone)) ? c.alt_phone : null;

            const id = randomUUID();
            const ts = now();
            db.prepare(`
                INSERT INTO prospects (id, owner_id, name, phone, alt_phone, country, city, quarter, facebook_profile_url, stage, stage_updated_at,
                                        source, interest_type, is_archived, next_followup_at, birthday, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, 'nouveau', ?, ?, NULL, 0, NULL, ?, ?, ?)
            `).run(id, ownerId, c.name, c.phone, altPhone, c.country || null, ts, c.source || null, c.birthday || null, ts, ts);

            db.prepare(`
                INSERT INTO stage_history (id, prospect_id, from_stage, to_stage, changed_at, note)
                VALUES (?, ?, NULL, 'nouveau', ?, NULL)
            `).run(randomUUID(), id, ts);

            existing.add(c.phone);
            if (altPhone) existing.add(altPhone);
            imported++;
        }
        db.exec('COMMIT;');
    } catch (err) {
        db.exec('ROLLBACK;');
        throw err;
    }

    return { imported, skipped_duplicate: skippedDuplicate };
}

// Every prospect read carries last_purchase_at, so the client can work out
// reorder reminders from the prospect list alone — including offline, from
// the cached list (see offline.js).
const PROSPECT_COLUMNS = `prospects.*,
    (SELECT MAX(purchased_at) FROM purchases WHERE purchases.prospect_id = prospects.id) AS last_purchase_at`;

function getProspect(ownerId, id) {
    return db.prepare(`SELECT ${PROSPECT_COLUMNS} FROM prospects WHERE id = ? AND owner_id = ?`).get(id, ownerId);
}

// "contains" pattern for LIKE ... ESCAPE '\': the user's own % and _ are
// matched literally instead of acting as wildcards (a search for "_" used to
// match everything).
function containsPattern(text) {
    return `%${String(text).replace(/[\\%_]/g, '\\$&')}%`;
}

// Filters: stage, source, interest_type, country, city, quarter (exact/partial match), search (name or phone), archived
function listProspects(ownerId, filters = {}) {
    const clauses = ['owner_id = ?'];
    const params = [ownerId];

    if (!filters.includeArchived) {
        clauses.push('is_archived = 0');
    }
    if (filters.stage) {
        clauses.push('stage = ?');
        params.push(filters.stage);
    }
    if (filters.source) {
        clauses.push('source = ?');
        params.push(filters.source);
    }
    if (filters.interest_type) {
        clauses.push('interest_type = ?');
        params.push(filters.interest_type);
    }
    if (filters.temperature) {
        clauses.push('temperature = ?');
        params.push(filters.temperature);
    }
    if (filters.country) {
        clauses.push('country = ?');
        params.push(filters.country);
    }
    if (filters.city) {
        clauses.push(`city LIKE ? ESCAPE '\\'`);
        params.push(containsPattern(filters.city));
    }
    if (filters.quarter) {
        clauses.push(`quarter LIKE ? ESCAPE '\\'`);
        params.push(containsPattern(filters.quarter));
    }
    if (filters.search) {
        clauses.push(`(name LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\')`);
        params.push(containsPattern(filters.search), containsPattern(filters.search));
    }

    const sql = `SELECT ${PROSPECT_COLUMNS} FROM prospects WHERE ${clauses.join(' AND ')} ORDER BY stage_updated_at DESC`;
    return db.prepare(sql).all(...params);
}

function updateProspect(ownerId, id, fields) {
    const existing = getProspect(ownerId, id);
    if (!existing) throw new NotFoundError('Contact introuvable');

    const allowed = ['name', 'phone', 'alt_phone', 'country', 'city', 'quarter', 'facebook_profile_url', 'source', 'interest_type', 'next_followup_at', 'reorder_interval_days', 'birthday', 'temperature'];
    const sets = [];
    const values = [];
    for (const key of allowed) {
        if (fields[key] !== undefined) {
            sets.push(`${key} = ?`);
            values.push(fields[key]);
        }
    }
    if (sets.length === 0) return existing;
    sets.push('updated_at = ?');
    values.push(now());
    values.push(id, ownerId);
    db.prepare(`UPDATE prospects SET ${sets.join(', ')} WHERE id = ? AND owner_id = ?`).run(...values);
    return getProspect(ownerId, id);
}

function transitionStage(ownerId, id, toStage, note) {
    if (!STAGES.includes(toStage)) {
        throw new ValidationError(`Etape invalide: ${toStage}`);
    }
    const prospect = getProspect(ownerId, id);
    if (!prospect) throw new NotFoundError('Contact introuvable');
    // "Moving" to the stage it's already in isn't a transition: recording it
    // would add a no-op line to the timeline and reset stage_updated_at,
    // making a stale contact look freshly active.
    if (prospect.stage === toStage) return prospect;

    const ts = now();
    db.prepare(`
        INSERT INTO stage_history (id, prospect_id, from_stage, to_stage, changed_at, note)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), id, prospect.stage, toStage, ts, note || null);

    return getProspect(ownerId, id);
}

function archiveProspect(ownerId, id, archived = true) {
    const existing = getProspect(ownerId, id);
    if (!existing) throw new NotFoundError('Contact introuvable');
    db.prepare(`UPDATE prospects SET is_archived = ?, updated_at = ? WHERE id = ? AND owner_id = ?`)
        .run(archived ? 1 : 0, now(), id, ownerId);
    return getProspect(ownerId, id);
}

// One change applied to many contacts at once (board selection mode).
// All-or-nothing in a single transaction; ids that don't exist or belong to
// someone else are silently ignored (never touched). Stage moves still go
// through stage_history, like transitionStage, so each one is logged — and a
// contact already at the target stage gets no history line.
const BULK_ACTIONS = ['stage', 'archive', 'temperature', 'followup'];
function bulkUpdateProspects(ownerId, ids, action, value) {
    const owned = [];
    const unique = [...new Set(ids)];
    for (let i = 0; i < unique.length; i += 500) {
        const chunk = unique.slice(i, i + 500);
        owned.push(...db.prepare(`
            SELECT id, stage FROM prospects WHERE owner_id = ? AND id IN (${chunk.map(() => '?').join(',')})
        `).all(ownerId, ...chunk));
    }

    const ts = now();
    db.exec('BEGIN IMMEDIATE;');
    try {
        const insertHistory = db.prepare(`
            INSERT INTO stage_history (id, prospect_id, from_stage, to_stage, changed_at, note)
            VALUES (?, ?, ?, ?, ?, NULL)
        `);
        const column = { archive: 'is_archived', temperature: 'temperature', followup: 'next_followup_at' }[action];
        const update = column && db.prepare(`UPDATE prospects SET ${column} = ?, updated_at = ? WHERE id = ? AND owner_id = ?`);
        for (const p of owned) {
            if (action === 'stage') {
                if (p.stage !== value) insertHistory.run(randomUUID(), p.id, p.stage, value, ts);
            } else {
                update.run(action === 'archive' ? (value ? 1 : 0) : value, ts, p.id, ownerId);
            }
        }
        db.exec('COMMIT;');
    } catch (err) {
        db.exec('ROLLBACK;');
        throw err;
    }
    return { updated: owned.length, prospects: owned.map(p => getProspect(ownerId, p.id)) };
}

function deleteProspect(ownerId, id) {
    db.prepare(`DELETE FROM prospects WHERE id = ? AND owner_id = ?`).run(id, ownerId);
}

// ============================================
// STAGE HISTORY
// ============================================
function getStageHistory(ownerId, prospectId) {
    const owned = getProspect(ownerId, prospectId);
    if (!owned) throw new NotFoundError('Contact introuvable');
    return db.prepare(`
        SELECT * FROM stage_history WHERE prospect_id = ? ORDER BY changed_at ASC
    `).all(prospectId);
}

// ============================================
// INTERACTIONS
// ============================================
function addInteraction(ownerId, prospectId, { type, content }) {
    const owned = getProspect(ownerId, prospectId);
    if (!owned) throw new NotFoundError('Contact introuvable');
    if (!INTERACTION_TYPES.includes(type)) {
        throw new ValidationError("Type d'interaction invalide");
    }
    const id = randomUUID();
    const ts = now();
    db.prepare(`
        INSERT INTO interactions (id, prospect_id, type, content, created_at)
        VALUES (?, ?, ?, ?, ?)
    `).run(id, prospectId, type, content, ts);

    db.prepare(`UPDATE prospects SET updated_at = ? WHERE id = ?`).run(ts, prospectId);

    return db.prepare(`SELECT * FROM interactions WHERE id = ?`).get(id);
}

function getInteractions(ownerId, prospectId) {
    const owned = getProspect(ownerId, prospectId);
    if (!owned) throw new NotFoundError('Contact introuvable');
    return db.prepare(`
        SELECT * FROM interactions WHERE prospect_id = ? ORDER BY created_at DESC
    `).all(prospectId);
}

// ============================================
// PURCHASES (clients' orders — drive reorder reminders)
// ============================================
function getPurchases(ownerId, prospectId) {
    const owned = getProspect(ownerId, prospectId);
    if (!owned) throw new NotFoundError('Contact introuvable');
    return db.prepare(`
        SELECT * FROM purchases WHERE prospect_id = ? ORDER BY purchased_at DESC
    `).all(prospectId);
}

function addPurchase(ownerId, prospectId, { purchased_at, product, amount, note }) {
    const owned = getProspect(ownerId, prospectId);
    if (!owned) throw new NotFoundError('Contact introuvable');
    const id = randomUUID();
    const ts = now();
    db.prepare(`
        INSERT INTO purchases (id, prospect_id, purchased_at, product, amount, note, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, prospectId, purchased_at || ts, product || null, amount ?? null, note || null, ts);
    db.prepare(`UPDATE prospects SET updated_at = ? WHERE id = ?`).run(ts, prospectId);
    return db.prepare(`SELECT * FROM purchases WHERE id = ?`).get(id);
}

function deletePurchase(ownerId, prospectId, purchaseId) {
    const owned = getProspect(ownerId, prospectId);
    if (!owned) throw new NotFoundError('Contact introuvable');
    db.prepare(`DELETE FROM purchases WHERE id = ? AND prospect_id = ?`).run(purchaseId, prospectId);
}

// ============================================
// MESSAGE TEMPLATES
// ============================================
function listTemplates(ownerId) {
    return db.prepare(`SELECT * FROM message_templates WHERE owner_id = ? ORDER BY name COLLATE NOCASE ASC`).all(ownerId);
}

function createTemplate(ownerId, { name, body }) {
    const id = randomUUID();
    const ts = now();
    db.prepare(`
        INSERT INTO message_templates (id, owner_id, name, body, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, ownerId, name, body, ts, ts);
    return db.prepare(`SELECT * FROM message_templates WHERE id = ?`).get(id);
}

// Starter pack offered to new users (a blank template list stops beginners
// cold: "what do I even write?"). Plain, relationship-first wording — no
// hype, nothing that reads like spam when it lands in someone's WhatsApp.
const STARTER_TEMPLATES = [
    { name: 'Premier contact', body: "Bonjour {prenom}, c'est {moi} ! Ça fait un moment, comment vas-tu ? J'ai pensé à toi récemment. Tu aurais 5 minutes cette semaine pour qu'on discute ?" },
    { name: 'Invitation à une présentation', body: "Salut {prenom} ! Je fais une courte présentation (20 minutes) d'un projet qui me tient à cœur. J'aimerais beaucoup avoir ton avis, même si ce n'est pas pour toi. Tu serais disponible quand ?" },
    { name: 'Relance après présentation', body: "Bonjour {prenom}, merci encore pour ton temps ! Qu'est-ce qui t'a le plus parlé ? Si tu as des questions, je suis là pour y répondre." },
    { name: 'Relance douce', body: "Coucou {prenom}, je ne veux pas te déranger. Je reviens simplement vers toi suite à notre échange : tu as pu y réfléchir ?" },
    { name: 'Bienvenue nouveau client', body: "Bienvenue {prenom} et merci pour ta confiance ! N'hésite pas à m'écrire pour toute question sur tes produits, je suis là pour t'accompagner." },
    { name: 'Réachat', body: "Bonjour {prenom}, ton stock tient encore ? Je peux te préparer ta prochaine commande dès cette semaine." },
    { name: 'Anniversaire', body: "Joyeux anniversaire {prenom} ! Je te souhaite une magnifique année, pleine de santé et de réussite. {moi}" }
];

// Adds the starter templates the user doesn't already have (matched by
// name), so running it twice never duplicates anything.
function addStarterTemplates(ownerId) {
    const existing = new Set(listTemplates(ownerId).map(t => t.name.toLowerCase()));
    return STARTER_TEMPLATES
        .filter(t => !existing.has(t.name.toLowerCase()))
        .map(t => createTemplate(ownerId, t));
}

function updateTemplate(ownerId, id, fields) {
    const existing = db.prepare(`SELECT * FROM message_templates WHERE id = ? AND owner_id = ?`).get(id, ownerId);
    if (!existing) throw new NotFoundError('Modele introuvable');
    const name = fields.name !== undefined ? fields.name : existing.name;
    const body = fields.body !== undefined ? fields.body : existing.body;
    db.prepare(`UPDATE message_templates SET name = ?, body = ?, updated_at = ? WHERE id = ? AND owner_id = ?`)
        .run(name, body, now(), id, ownerId);
    return db.prepare(`SELECT * FROM message_templates WHERE id = ?`).get(id);
}

function deleteTemplate(ownerId, id) {
    db.prepare(`DELETE FROM message_templates WHERE id = ? AND owner_id = ?`).run(id, ownerId);
}

// ============================================
// FEEDBACK ("Donner mon avis")
// ============================================
const FEEDBACK_TYPES = ['probleme', 'idee', 'question', 'autre'];
const FEEDBACK_STATUSES = ['nouveau', 'traite'];

function createFeedback(userId, { type, message, platform, app_version }) {
    const id = randomUUID();
    db.prepare(`
        INSERT INTO feedback (id, user_id, type, message, platform, app_version, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'nouveau', ?)
    `).run(id, userId, type, message, platform || null, app_version || null, now());
    return db.prepare(`SELECT * FROM feedback WHERE id = ?`).get(id);
}

// Admin view: newest first, with who sent it (name + phone for the reply).
function listFeedback() {
    return db.prepare(`
        SELECT f.*, u.name AS user_name, u.phone AS user_phone
        FROM feedback f JOIN users u ON u.id = f.user_id
        ORDER BY f.created_at DESC, f.rowid DESC
    `).all();
}

function setFeedbackStatus(id, status) {
    const existing = db.prepare(`SELECT id FROM feedback WHERE id = ?`).get(id);
    if (!existing) throw new NotFoundError('Message introuvable');
    db.prepare(`UPDATE feedback SET status = ?, handled_at = ? WHERE id = ?`)
        .run(status, status === 'traite' ? now() : null, id);
    return db.prepare(`SELECT * FROM feedback WHERE id = ?`).get(id);
}

// ============================================
// REMINDERS
// ============================================
function getDueReminders(ownerId) {
    const nowIso = now();
    return db.prepare(`
        SELECT ${PROSPECT_COLUMNS} FROM prospects
        WHERE owner_id = ?
          AND is_archived = 0
          AND next_followup_at IS NOT NULL
          AND next_followup_at <= ?
        ORDER BY next_followup_at ASC
    `).all(ownerId, nowIso);
}

// ============================================
// STATS
// ============================================
// One data point per converted contact, measured to its *first* conversion:
// a contact who became client and later partenaire (or went back and forth)
// has several client/partenaire rows in stage_history, and counting each one
// both inflated the conversion count and skewed the median towards the
// slower, later transitions.
// `since` (ISO string or null) limits every stat below to a period: here,
// conversions that happened within it.
function getConversionBenchmark(ownerId, since = null) {
    const rows = db.prepare(`
        SELECT
            sh.prospect_id AS prospect_id,
            MIN(sh.changed_at) AS converted_at,
            (SELECT MIN(changed_at) FROM stage_history WHERE prospect_id = sh.prospect_id) AS started_at
        FROM stage_history sh
        JOIN prospects p ON p.id = sh.prospect_id
        WHERE sh.to_stage IN ('client', 'partenaire') AND p.owner_id = ?
        GROUP BY sh.prospect_id
    `).all(ownerId).filter(r => !since || r.converted_at >= since);

    const days = rows
        .map(r => (new Date(r.converted_at) - new Date(r.started_at)) / (1000 * 60 * 60 * 24))
        .filter(d => d >= 0)
        .sort((a, b) => a - b);

    if (days.length === 0) {
        return { count: 0, median_days: null, min_days: null, max_days: null };
    }

    const mid = Math.floor(days.length / 2);
    const median = days.length % 2 === 0 ? (days[mid - 1] + days[mid]) / 2 : days[mid];

    return {
        count: days.length,
        median_days: Math.round(median * 10) / 10,
        min_days: Math.round(days[0] * 10) / 10,
        max_days: Math.round(days[days.length - 1] * 10) / 10
    };
}

// Conversion rates count every contact ever added, archived ("Perdu") ones
// included. Excluding archived non-converted contacts — as this used to —
// removed exactly the failures from the denominator, so the rate went *up*
// every time a contact was marked lost.
// With a period, only contacts *added* within it count.
function getSourceStats(ownerId, since = null) {
    const rows = db.prepare(`
        SELECT
            COALESCE(source, 'non_renseigne') AS source,
            COUNT(*) AS total,
            SUM(CASE WHEN stage IN ('client', 'partenaire') THEN 1 ELSE 0 END) AS converted
        FROM prospects
        WHERE owner_id = ? AND created_at >= ?
        GROUP BY COALESCE(source, 'non_renseigne')
        ORDER BY total DESC
    `).all(ownerId, since || '');

    return rows.map(r => ({
        source: r.source,
        total: r.total,
        converted: r.converted,
        conversion_rate: r.total > 0 ? Math.round((r.converted / r.total) * 1000) / 10 : 0
    }));
}

// Effort, not just results: what the rep *did* in the period (messages,
// calls, new contacts, stage moves), what it produced (conversions,
// revenue), and the funnel — how many of the contacts added in the period
// reached each stage (a contact that went straight from "nouveau" to
// "client" counts as having passed every stage in between).
function getActivityStats(ownerId, since = null) {
    const from = since || '';

    const interactions = { message: 0, appel: 0, rencontre: 0, note: 0 };
    for (const r of db.prepare(`
        SELECT i.type, COUNT(*) AS n FROM interactions i
        JOIN prospects p ON p.id = i.prospect_id
        WHERE p.owner_id = ? AND i.created_at >= ?
        GROUP BY i.type
    `).all(ownerId, from)) interactions[r.type] = r.n;

    const newContacts = db.prepare(`
        SELECT COUNT(*) AS n FROM prospects WHERE owner_id = ? AND created_at >= ?
    `).get(ownerId, from).n;

    let stageAdvances = 0;
    for (const r of db.prepare(`
        SELECT sh.from_stage, sh.to_stage FROM stage_history sh
        JOIN prospects p ON p.id = sh.prospect_id
        WHERE p.owner_id = ? AND sh.from_stage IS NOT NULL AND sh.changed_at >= ?
    `).all(ownerId, from)) {
        if (STAGES.indexOf(r.to_stage) > STAGES.indexOf(r.from_stage)) stageAdvances++;
    }

    const revenue = db.prepare(`
        SELECT COUNT(*) AS purchases, COALESCE(SUM(pu.amount), 0) AS total FROM purchases pu
        JOIN prospects p ON p.id = pu.prospect_id
        WHERE p.owner_id = ? AND pu.purchased_at >= ?
    `).get(ownerId, from);

    const furthest = new Map(); // prospect_id -> highest stage index ever reached
    for (const r of db.prepare(`
        SELECT sh.prospect_id, sh.to_stage FROM stage_history sh
        JOIN prospects p ON p.id = sh.prospect_id
        WHERE p.owner_id = ? AND p.created_at >= ?
    `).all(ownerId, from)) {
        const idx = STAGES.indexOf(r.to_stage);
        if (idx > (furthest.get(r.prospect_id) ?? -1)) furthest.set(r.prospect_id, idx);
    }
    // client and partenaire are two outcomes, not two steps: the funnel's
    // last step is "converted" (either one).
    const FUNNEL = ['nouveau', 'contacte', 'prospect', 'interesse', 'en_decision', 'client'];
    const funnel = FUNNEL.map((stage, i) => ({
        stage: stage === 'client' ? 'converti' : stage,
        count: [...furthest.values()].filter(idx => idx >= i).length
    }));

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const lastSevenDays = db.prepare(`
        SELECT COUNT(*) AS n FROM interactions i
        JOIN prospects p ON p.id = i.prospect_id
        WHERE p.owner_id = ? AND i.created_at >= ? AND i.type != 'note'
    `).get(ownerId, weekAgo).n;

    return {
        interactions,
        actions: interactions.message + interactions.appel + interactions.rencontre,
        new_contacts: newContacts,
        stage_advances: stageAdvances,
        conversions: getConversionBenchmark(ownerId, since).count,
        purchases: revenue.purchases,
        revenue: revenue.total,
        funnel,
        last_7_days_actions: lastSevenDays
    };
}

function setWeeklyGoal(userId, goal) {
    db.prepare(`UPDATE users SET weekly_goal = ? WHERE id = ?`).run(goal, userId);
    return getUserById(userId);
}

// ============================================
// BACKUP
// ============================================
// Takes a consistent, point-in-time snapshot of the live database using
// SQLite's VACUUM INTO. Safe to run while the server is handling requests —
// SQLite handles the concurrency internally, so callers never need to stop
// the app or worry about copying a file mid-write (which a plain fs.copyFile
// of the live .db could do, corrupting the backup).
// destPath is always generated by our own code (scripts/backup.js), never
// taken from user input, but we still guard against the one character
// (a single quote) that would break the embedded SQL string.
function backupTo(destPath) {
    if (destPath.includes(`'`)) {
        throw new ValidationError('Backup path must not contain a single quote');
    }
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    if (fs.existsSync(destPath)) {
        fs.unlinkSync(destPath);
    }
    db.exec(`VACUUM INTO '${destPath}'`);
    return destPath;
}

// Country breakdown — answers "which countries is my downline actually in".
// Same denominator as getSourceStats: archived contacts included.
function getCountryStats(ownerId, since = null) {
    const rows = db.prepare(`
        SELECT
            COALESCE(country, 'non_renseigne') AS country,
            COUNT(*) AS total,
            SUM(CASE WHEN stage IN ('client', 'partenaire') THEN 1 ELSE 0 END) AS converted
        FROM prospects
        WHERE owner_id = ? AND created_at >= ?
        GROUP BY COALESCE(country, 'non_renseigne')
        ORDER BY total DESC
    `).all(ownerId, since || '');

    return rows.map(r => ({
        country: r.country,
        total: r.total,
        converted: r.converted,
        conversion_rate: r.total > 0 ? Math.round((r.converted / r.total) * 1000) / 10 : 0
    }));
}

// Only the test suite needs this (so Windows releases the temp DB file and
// it can be deleted); the server keeps its connection for its lifetime.
function close() {
    try { db.close(); } catch { /* already closed */ }
}

module.exports = {
    close,
    STAGES,
    INTEREST_TYPES,
    TEMPERATURES,
    INTERACTION_TYPES,
    createUser,
    findUserByPhone,
    getUserById,
    listAllUsers,
    adminListUsers,
    markRenewalReminded,
    resetPasswordByPhone,
    setUserAdmin,
    setUserActive,
    setUserActiveById,
    startTrial,
    unlockUserById,
    resetPasswordById,
    getLoginLockedUntil,
    registerFailedLogin,
    clearFailedLogins,
    clearAllFailedLogins,
    verifyPassword,
    createSession,
    getSession,
    deleteSession,
    deleteSessionsForUser,
    createProspect,
    bulkImportProspects,
    getProspect,
    listProspects,
    updateProspect,
    transitionStage,
    archiveProspect,
    BULK_ACTIONS,
    bulkUpdateProspects,
    deleteProspect,
    getStageHistory,
    addInteraction,
    getInteractions,
    FEEDBACK_TYPES,
    FEEDBACK_STATUSES,
    createFeedback,
    listFeedback,
    setFeedbackStatus,
    getPurchases,
    addPurchase,
    deletePurchase,
    listTemplates,
    createTemplate,
    addStarterTemplates,
    updateTemplate,
    deleteTemplate,
    getDueReminders,
    getConversionBenchmark,
    getSourceStats,
    getCountryStats,
    getActivityStats,
    setWeeklyGoal,
    backupTo
};
