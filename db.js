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
})();

(function migrateProspectColumns() {
    const cols = db.prepare(`PRAGMA table_info(prospects)`).all().map(c => c.name);
    if (!cols.includes('alt_phone')) {
        db.exec(`ALTER TABLE prospects ADD COLUMN alt_phone TEXT;`);
    }
})();

const STAGES = ['nouveau', 'contacte', 'prospect', 'interesse', 'en_decision', 'client', 'partenaire'];
const FAILED_LOGIN_LOCK_THRESHOLD = 4; // lock the account after this many consecutive failures
const LOCKOUT_DURATION_MIN = 15;
const INTEREST_TYPES = ['produit', 'opportunite', 'indecis'];
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
    return db.prepare(`SELECT id, name, phone, is_active, is_admin, created_at FROM users WHERE id = ?`).get(id);
}

function listAllUsers() {
    return db.prepare(`SELECT id, name, phone, is_active, is_admin, created_at FROM users ORDER BY created_at ASC`).all();
}

// Fuller view for the admin API — includes lockout state, which regular
// listAllUsers() (also used by the CLI scripts) doesn't need to show.
function adminListUsers() {
    return db.prepare(`
        SELECT id, name, phone, is_active, is_admin, failed_login_attempts, locked_until, created_at
        FROM users ORDER BY created_at ASC
    `).all();
}

// Admin-only: reset a user's password directly (used by scripts/reset-password.js,
// not exposed via any HTTP route). Also invalidates all existing sessions for that
// user, so a lost/compromised password can't still be used via an old session cookie.
function resetPasswordByPhone(phone, newPassword) {
    const user = findUserByPhone(phone);
    if (!user) throw new NotFoundError(`Aucun compte trouve pour le numero ${phone}`);

    const { salt, hash } = hashPassword(newPassword);
    db.prepare(`UPDATE users SET password_hash = ?, password_salt = ?, failed_login_attempts = 0, locked_until = NULL WHERE id = ?`)
        .run(hash, salt, user.id);
    db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(user.id);

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

// Admin-only: activate/deactivate a user directly (used by
// scripts/activate-account.js, not exposed via any HTTP route).
function setUserActive(phone, active) {
    const user = findUserByPhone(phone);
    if (!user) throw new NotFoundError(`Aucun compte trouve pour le numero ${phone}`);
    db.prepare(`UPDATE users SET is_active = ? WHERE id = ?`).run(active ? 1 : 0, user.id);
    // Activating a previously-blocked account should also clear any lockout
    // left over from failed attempts, so it isn't immediately re-blocked.
    if (active) {
        db.prepare(`UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?`).run(user.id);
    }
    return { id: user.id, name: user.name, phone: user.phone, is_active: active ? 1 : 0 };
}

// ---- id-based variants used by the admin HTTP API (server.js) ----
// The CLI scripts use the phone-based versions above since an operator at a
// terminal knows the phone number, not the internal id; the admin API
// operates on ids returned by adminListUsers().
function setUserActiveById(userId, active) {
    const user = db.prepare(`SELECT id, name, phone FROM users WHERE id = ?`).get(userId);
    if (!user) throw new NotFoundError('Compte introuvable');
    db.prepare(`UPDATE users SET is_active = ? WHERE id = ?`).run(active ? 1 : 0, userId);
    if (active) {
        db.prepare(`UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?`).run(userId);
    }
    return { id: user.id, name: user.name, phone: user.phone, is_active: active ? 1 : 0 };
}

function unlockUserById(userId) {
    const user = db.prepare(`SELECT id, name, phone FROM users WHERE id = ?`).get(userId);
    if (!user) throw new NotFoundError('Compte introuvable');
    db.prepare(`UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?`).run(userId);
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
    db.prepare(`UPDATE users SET password_hash = ?, password_salt = ?, failed_login_attempts = 0, locked_until = NULL WHERE id = ?`)
        .run(hash, salt, userId);
    db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(userId);

    return { id: user.id, name: user.name, phone: user.phone };
}

// Called on every failed password check. Once the account hits
// FAILED_LOGIN_LOCK_THRESHOLD consecutive failures, it's locked for
// LOCKOUT_DURATION_MIN minutes and the counter resets.
function registerFailedLogin(userId) {
    const user = db.prepare(`SELECT failed_login_attempts FROM users WHERE id = ?`).get(userId);
    const attempts = (user?.failed_login_attempts || 0) + 1;
    if (attempts >= FAILED_LOGIN_LOCK_THRESHOLD) {
        const lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MIN * 60 * 1000).toISOString();
        db.prepare(`UPDATE users SET failed_login_attempts = 0, locked_until = ? WHERE id = ?`).run(lockedUntil, userId);
        return { locked: true, lockedUntil };
    }
    db.prepare(`UPDATE users SET failed_login_attempts = ? WHERE id = ?`).run(attempts, userId);
    return { locked: false, attemptsRemaining: FAILED_LOGIN_LOCK_THRESHOLD - attempts };
}

function clearFailedLogins(userId) {
    db.prepare(`UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?`).run(userId);
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

// ============================================
// PROSPECTS
// ============================================
function createProspect(ownerId, { name, phone, alt_phone, country, city, quarter, facebook_profile_url, source, interest_type, next_followup_at }) {
    const id = randomUUID();
    const ts = now();

    // Wrapped in a transaction: without this, a failure on the second
    // INSERT (e.g. a trigger error) leaves an orphaned prospect row with no
    // stage_history entry — the two must succeed or fail together.
    db.exec('BEGIN IMMEDIATE;');
    try {
        db.prepare(`
            INSERT INTO prospects (id, owner_id, name, phone, alt_phone, country, city, quarter, facebook_profile_url, stage, stage_updated_at,
                                    source, interest_type, is_archived, next_followup_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'nouveau', ?, ?, ?, 0, ?, ?, ?)
        `).run(id, ownerId, name, phone || null, alt_phone || null, country || null, city || null, quarter || null, facebook_profile_url || null,
               ts, source || null, interest_type || null, next_followup_at || null, ts, ts);

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
                                        source, interest_type, is_archived, next_followup_at, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, 'nouveau', ?, ?, NULL, 0, NULL, ?, ?)
            `).run(id, ownerId, c.name, c.phone, altPhone, c.country || null, ts, c.source || null, ts, ts);

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

function getProspect(ownerId, id) {
    return db.prepare(`SELECT * FROM prospects WHERE id = ? AND owner_id = ?`).get(id, ownerId);
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
    if (filters.country) {
        clauses.push('country = ?');
        params.push(filters.country);
    }
    if (filters.city) {
        clauses.push('city LIKE ?');
        params.push(`%${filters.city}%`);
    }
    if (filters.quarter) {
        clauses.push('quarter LIKE ?');
        params.push(`%${filters.quarter}%`);
    }
    if (filters.search) {
        clauses.push('(name LIKE ? OR phone LIKE ?)');
        params.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    const sql = `SELECT * FROM prospects WHERE ${clauses.join(' AND ')} ORDER BY stage_updated_at DESC`;
    return db.prepare(sql).all(...params);
}

function updateProspect(ownerId, id, fields) {
    const existing = getProspect(ownerId, id);
    if (!existing) throw new NotFoundError('Contact introuvable');

    const allowed = ['name', 'phone', 'alt_phone', 'country', 'city', 'quarter', 'facebook_profile_url', 'source', 'interest_type', 'next_followup_at'];
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
// REMINDERS
// ============================================
function getDueReminders(ownerId) {
    const nowIso = now();
    return db.prepare(`
        SELECT * FROM prospects
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
function getConversionBenchmark(ownerId) {
    const rows = db.prepare(`
        SELECT
            sh.prospect_id AS prospect_id,
            sh.changed_at AS converted_at,
            (SELECT MIN(changed_at) FROM stage_history WHERE prospect_id = sh.prospect_id) AS started_at
        FROM stage_history sh
        JOIN prospects p ON p.id = sh.prospect_id
        WHERE sh.to_stage IN ('client', 'partenaire') AND p.owner_id = ?
    `).all(ownerId);

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

function getSourceStats(ownerId) {
    const rows = db.prepare(`
        SELECT
            COALESCE(source, 'non_renseigne') AS source,
            COUNT(*) AS total,
            SUM(CASE WHEN stage IN ('client', 'partenaire') THEN 1 ELSE 0 END) AS converted
        FROM prospects
        WHERE owner_id = ? AND (is_archived = 0 OR stage IN ('client', 'partenaire'))
        GROUP BY COALESCE(source, 'non_renseigne')
        ORDER BY total DESC
    `).all(ownerId);

    return rows.map(r => ({
        source: r.source,
        total: r.total,
        converted: r.converted,
        conversion_rate: r.total > 0 ? Math.round((r.converted / r.total) * 1000) / 10 : 0
    }));
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

// Country breakdown — answers "which countries is my downline actually in"
function getCountryStats(ownerId) {
    const rows = db.prepare(`
        SELECT
            COALESCE(country, 'non_renseigne') AS country,
            COUNT(*) AS total,
            SUM(CASE WHEN stage IN ('client', 'partenaire') THEN 1 ELSE 0 END) AS converted
        FROM prospects
        WHERE owner_id = ? AND (is_archived = 0 OR stage IN ('client', 'partenaire'))
        GROUP BY COALESCE(country, 'non_renseigne')
        ORDER BY total DESC
    `).all(ownerId);

    return rows.map(r => ({
        country: r.country,
        total: r.total,
        converted: r.converted,
        conversion_rate: r.total > 0 ? Math.round((r.converted / r.total) * 1000) / 10 : 0
    }));
}

module.exports = {
    STAGES,
    INTEREST_TYPES,
    INTERACTION_TYPES,
    createUser,
    findUserByPhone,
    getUserById,
    listAllUsers,
    adminListUsers,
    resetPasswordByPhone,
    setUserAdmin,
    setUserActive,
    setUserActiveById,
    unlockUserById,
    resetPasswordById,
    registerFailedLogin,
    clearFailedLogins,
    verifyPassword,
    createSession,
    getSession,
    deleteSession,
    createProspect,
    bulkImportProspects,
    getProspect,
    listProspects,
    updateProspect,
    transitionStage,
    archiveProspect,
    deleteProspect,
    getStageHistory,
    addInteraction,
    getInteractions,
    getDueReminders,
    getConversionBenchmark,
    getSourceStats,
    getCountryStats,
    backupTo
};
