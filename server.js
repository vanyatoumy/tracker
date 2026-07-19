const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const db = require('./db');
const config = require('./config');
const validate = require('./validate');
const { ValidationError, AuthError } = require('./errors');
const { expandContactRows } = require('./google-contacts-import');

const app = express();
const PORT = config.PORT;
const COOKIE_NAME = 'session_token';
const isProd = config.isProd;

// Behind a reverse proxy (most hosts), trust the X-Forwarded-For header so
// rate limiting and logging see the real client IP, not the proxy's.
if (config.TRUST_PROXY) {
    app.set('trust proxy', 1);
}

// Custom CSP: the frontend is vanilla JS/CSS served from this same origin
// (no inline <script>), plus Google Fonts for the Montserrat typeface.
// style-src needs 'unsafe-inline' because app.js renders a few dynamic
// inline styles (e.g. the kanban progress-bar fill percentage) via
// innerHTML — fine here since there is no inline *script*, only style.
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com'],
            imgSrc: ["'self'", 'data:'],
            connectSrc: ["'self'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            frameAncestors: ["'self'"],
            // Helmet enables this by default, which makes the browser silently
            // rewrite every subresource request (CSS/JS/img) to https:// before
            // sending it. Fine behind a TLS-terminating reverse proxy, but fatal
            // when the app is reached directly over plain HTTP (no nginx/Caddy
            // in front yet) — nothing answers on 443, so every asset fails with
            // a generic connection error and the page renders unstyled.
            // TODO: remove this override once TLS is set up in front of the app.
            upgradeInsecureRequests: null
        }
    }
}));
// Contact imports send a JSON array of raw CSV rows, which can run well
// past the normal 100kb request limit for a large Google Contacts export
// (up to 5000 rows, capped in the import route). Every other route stays on
// the tight default. Only one of these ever runs per request — chaining two
// express.json() instances on the same request would try to read the body
// stream twice.
const jsonBodyDefault = express.json({ limit: '100kb' });
const jsonBodyImport = express.json({ limit: '10mb' });
app.use((req, res, next) => {
    const parser = req.path === '/api/prospects/import' ? jsonBodyImport : jsonBodyDefault;
    parser(req, res, next);
});
app.use((req, res, next) => { if (!req.body || typeof req.body !== 'object') req.body = {}; next(); });
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Brute-force / signup-spam protection on the auth endpoints only — the rest
// of the API is already gated behind an authenticated session.
const authLimiter = rateLimit({
    windowMs: config.RATE_LIMIT_AUTH_WINDOW_MIN * 60 * 1000,
    max: config.RATE_LIMIT_AUTH_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Trop de tentatives, reessaie plus tard' }
});

function handleError(res, err) {
    console.error(err);
    if (err.statusCode) {
        return res.status(err.statusCode).json({ error: err.message });
    }
    // Unexpected/internal error: never leak details (stack traces, SQL,
    // file paths) to the client. Full detail is already in the server log
    // above via console.error.
    res.status(500).json({ error: isProd ? 'Une erreur interne est survenue' : err.message });
}

function setSessionCookie(res, token, expiresAt) {
    res.cookie(COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.COOKIE_SECURE,
        expires: new Date(expiresAt)
    });
}

// ---------- AUTH MIDDLEWARE ----------
function requireAuth(req, res, next) {
    const token = req.cookies[COOKIE_NAME];
    if (!token) return res.status(401).json({ error: 'Non authentifie' });
    const session = db.getSession(token);
    if (!session) return res.status(401).json({ error: 'Session expiree, reconnecte-toi' });
    req.userId = session.user_id;
    next();
}

// Must run after requireAuth (needs req.userId). Kept separate rather than
// folded into requireAuth so ordinary routes don't pay for an extra DB
// lookup just to check a flag they never use.
function requireAdmin(req, res, next) {
    const user = db.getUserById(req.userId);
    if (!user || !user.is_admin) {
        return res.status(403).json({ error: 'Acces reserve aux administrateurs' });
    }
    next();
}

// ---------- AUTH ROUTES ----------

app.post('/api/auth/register', authLimiter, (req, res) => {
    try {
        const name = validate.str(req.body.name, 'Le nom', { required: true, maxLength: 100 });
        const phone = validate.phone(req.body.phone, 'Le numero', { required: true });
        const { password } = req.body;
        if (typeof password !== 'string' || password.length < 6 || password.length > 200) {
            throw new ValidationError('Mot de passe : 6 a 200 caracteres');
        }

        // New accounts are created inactive (see db.js) and can't log in until an
        // admin activates them via scripts/activate-account.js — no admin dashboard
        // yet. So, unlike before, registration does NOT auto-login: creating a
        // session here would let an inactive account straight into the app,
        // defeating the activation gate entirely.
        const user = db.createUser({ name, phone, password });
        res.status(201).json({
            ...user,
            message: "Compte cree. Il doit etre active par un administrateur avant que tu puisses te connecter."
        });
    } catch (err) { handleError(res, err); }
});

app.post('/api/auth/login', authLimiter, (req, res) => {
    try {
        // Deliberately lenient here (no strict format check): existing
        // accounts must always be able to log in even if validation rules
        // tighten later. Format is enforced at registration time instead.
        const phone = typeof req.body.phone === 'string' ? req.body.phone.trim() : '';
        const password = typeof req.body.password === 'string' ? req.body.password : '';
        const user = phone ? db.findUserByPhone(phone) : null;

        // Check lockout before touching the password, so a locked account
        // gets a clear "try again later" message instead of a generic
        // credentials error on every attempt while it's locked.
        if (user && user.locked_until && new Date(user.locked_until) > new Date()) {
            const minutesLeft = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
            throw new AuthError(`Compte temporairement bloque suite a plusieurs echecs. Reessaie dans ${minutesLeft} minute(s).`);
        }

        if (!user || !db.verifyPassword(password, user.password_salt, user.password_hash)) {
            if (user) db.registerFailedLogin(user.id);
            throw new AuthError('Numero ou mot de passe incorrect');
        }

        if (!user.is_active) {
            throw new AuthError('Ce compte n\'a pas encore ete active. Contacte l\'administrateur.');
        }

        db.clearFailedLogins(user.id);
        const { token, expires_at } = db.createSession(user.id);
        setSessionCookie(res, token, expires_at);
        res.json({ id: user.id, name: user.name, phone: user.phone, is_admin: !!user.is_admin });
    } catch (err) { handleError(res, err); }
});

app.post('/api/auth/logout', (req, res) => {
    const token = req.cookies[COOKIE_NAME];
    if (token) db.deleteSession(token);
    res.clearCookie(COOKIE_NAME);
    res.status(204).end();
});

app.get('/api/auth/me', (req, res) => {
    const token = req.cookies[COOKIE_NAME];
    if (!token) return res.status(401).json({ error: 'Non authentifie' });
    const session = db.getSession(token);
    if (!session) return res.status(401).json({ error: 'Session expiree' });
    const user = db.getUserById(session.user_id);
    res.json(user);
});

// ---------- ADMIN (all require auth + is_admin) ----------
// Covers what used to require direct DB/CLI access: viewing accounts,
// activating them, and clearing a lockout. Granting admin rights itself
// stays CLI-only (scripts/set-admin.js) — see the comment there for why.

app.get('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
    try {
        res.json(db.adminListUsers());
    } catch (err) { handleError(res, err); }
});

app.post('/api/admin/users/:id/activate', requireAuth, requireAdmin, (req, res) => {
    try {
        const active = req.body.active !== false; // defaults to true if omitted
        res.json(db.setUserActiveById(req.params.id, active));
    } catch (err) { handleError(res, err); }
});

app.post('/api/admin/users/:id/unlock', requireAuth, requireAdmin, (req, res) => {
    try {
        res.json(db.unlockUserById(req.params.id));
    } catch (err) { handleError(res, err); }
});

// Admin-assisted password reset: replaces "ask the operator to run
// scripts/reset-password.js on the server" for the common case. The admin
// picks the new password and tells the user out-of-band (call, WhatsApp,
// etc.) — there's no email/SMS integration to deliver it automatically yet.
app.post('/api/admin/users/:id/reset-password', requireAuth, requireAdmin, (req, res) => {
    try {
        const { new_password } = req.body;
        if (typeof new_password !== 'string' || new_password.length < 6 || new_password.length > 200) {
            throw new ValidationError('Mot de passe : 6 a 200 caracteres');
        }
        res.json(db.resetPasswordById(req.params.id, new_password));
    } catch (err) { handleError(res, err); }
});

// ---------- PROSPECTS (all require auth, all scoped to req.userId) ----------

app.get('/api/prospects', requireAuth, (req, res) => {
    try {
        const { archived, stage, source, interest_type, country, city, quarter, search } = req.query;
        res.json(db.listProspects(req.userId, {
            includeArchived: archived === '1',
            stage: stage || undefined,
            source: source || undefined,
            interest_type: interest_type || undefined,
            country: country || undefined,
            city: city || undefined,
            quarter: quarter || undefined,
            search: search || undefined
        }));
    } catch (err) { handleError(res, err); }
});

app.post('/api/prospects', requireAuth, (req, res) => {
    try {
        const body = req.body || {};
        const name = validate.str(body.name, 'Le nom', { required: true, maxLength: 200 });
        const phone = validate.phone(body.phone, 'Le telephone');
        const alt_phone = validate.phone(body.alt_phone, 'Le telephone secondaire');
        const country = validate.str(body.country, 'Le pays', { maxLength: 100 });
        const city = validate.str(body.city, 'La ville', { maxLength: 100 });
        const quarter = validate.str(body.quarter, 'Le quartier', { maxLength: 100 });
        const source = validate.str(body.source, 'La source', { maxLength: 50 });
        const interest_type = validate.oneOf(body.interest_type, "Le type d'interet", db.INTEREST_TYPES);
        const next_followup_at = validate.isoDate(body.next_followup_at, 'La date de relance');
        const facebook_profile_url = validate.url(body.facebook_profile_url, 'Le lien Facebook');

        res.status(201).json(db.createProspect(req.userId, {
            name, phone, alt_phone, country, city, quarter, facebook_profile_url, source, interest_type, next_followup_at
        }));
    } catch (err) { handleError(res, err); }
});

// Bulk import straight from a Google Contacts CSV export. Accepts an array
// of raw row objects as produced by parsing that CSV client-side (headers
// like "First Name", "Last Name", "Phone 1 - Value", ...) — phone parsing,
// validation, and country lookup all happen here via google-libphonenumber,
// so users can upload the unmodified Google export with no separate
// conversion step.
app.post('/api/prospects/import', requireAuth, (req, res) => {
    try {
        const rows = (req.body && req.body.rows) || [];
        if (!Array.isArray(rows)) {
            throw new ValidationError('rows doit etre un tableau');
        }
        if (rows.length > 5000) {
            throw new ValidationError('Maximum 5000 lignes par import');
        }

        const {
            candidates,
            skippedNoName,
            skippedInvalidPhone,
            skippedDuplicateInFile
        } = expandContactRows(rows);

        const { imported, skipped_duplicate } = db.bulkImportProspects(req.userId, candidates);

        res.json({
            total_rows: rows.length,
            imported,
            skipped_duplicate_existing: skipped_duplicate,
            skipped_duplicate_in_file: skippedDuplicateInFile,
            skipped_invalid_phone: skippedInvalidPhone,
            skipped_no_name: skippedNoName
        });
    } catch (err) { handleError(res, err); }
});

app.get('/api/prospects/:id', requireAuth, (req, res) => {
    const p = db.getProspect(req.userId, req.params.id);
    if (!p) return res.status(404).json({ error: 'Introuvable' });
    res.json(p);
});

app.patch('/api/prospects/:id', requireAuth, (req, res) => {
    try {
        const body = req.body || {};
        const fields = {};
        if ('name' in body) fields.name = validate.str(body.name, 'Le nom', { required: true, maxLength: 200 });
        if ('phone' in body) fields.phone = validate.phone(body.phone, 'Le telephone');
        if ('alt_phone' in body) fields.alt_phone = validate.phone(body.alt_phone, 'Le telephone secondaire');
        if ('country' in body) fields.country = validate.str(body.country, 'Le pays', { maxLength: 100 });
        if ('city' in body) fields.city = validate.str(body.city, 'La ville', { maxLength: 100 });
        if ('quarter' in body) fields.quarter = validate.str(body.quarter, 'Le quartier', { maxLength: 100 });
        if ('source' in body) fields.source = validate.str(body.source, 'La source', { maxLength: 50 });
        if ('interest_type' in body) fields.interest_type = validate.oneOf(body.interest_type, "Le type d'interet", db.INTEREST_TYPES);
        if ('next_followup_at' in body) fields.next_followup_at = validate.isoDate(body.next_followup_at, 'La date de relance');
        if ('facebook_profile_url' in body) fields.facebook_profile_url = validate.url(body.facebook_profile_url, 'Le lien Facebook');

        res.json(db.updateProspect(req.userId, req.params.id, fields));
    } catch (err) { handleError(res, err); }
});

app.post('/api/prospects/:id/stage', requireAuth, (req, res) => {
    try {
        const to_stage = validate.oneOf(req.body.to_stage, "L'etape", db.STAGES, { required: true });
        const note = validate.str(req.body.note, 'La note', { maxLength: 1000 });
        res.json(db.transitionStage(req.userId, req.params.id, to_stage, note));
    } catch (err) { handleError(res, err); }
});

app.post('/api/prospects/:id/archive', requireAuth, (req, res) => {
    try {
        const archived = req.body.archived !== false;
        res.json(db.archiveProspect(req.userId, req.params.id, archived));
    } catch (err) { handleError(res, err); }
});

app.delete('/api/prospects/:id', requireAuth, (req, res) => {
    try {
        db.deleteProspect(req.userId, req.params.id);
        res.status(204).end();
    } catch (err) { handleError(res, err); }
});

app.get('/api/prospects/:id/history', requireAuth, (req, res) => {
    try {
        res.json(db.getStageHistory(req.userId, req.params.id));
    } catch (err) { handleError(res, err); }
});

// ---------- INTERACTIONS ----------

app.get('/api/prospects/:id/interactions', requireAuth, (req, res) => {
    try {
        res.json(db.getInteractions(req.userId, req.params.id));
    } catch (err) { handleError(res, err); }
});

app.post('/api/prospects/:id/interactions', requireAuth, (req, res) => {
    try {
        const type = validate.oneOf(req.body.type, "Le type d'interaction", db.INTERACTION_TYPES, { required: true });
        const content = validate.str(req.body.content, 'Le contenu', { required: true, maxLength: 2000 });
        res.status(201).json(db.addInteraction(req.userId, req.params.id, { type, content }));
    } catch (err) { handleError(res, err); }
});

// ---------- REMINDERS ----------

app.get('/api/reminders', requireAuth, (req, res) => {
    try {
        res.json(db.getDueReminders(req.userId));
    } catch (err) { handleError(res, err); }
});

// ---------- STATS ----------

app.get('/api/stats/benchmark', requireAuth, (req, res) => {
    try {
        res.json(db.getConversionBenchmark(req.userId));
    } catch (err) { handleError(res, err); }
});

app.get('/api/stats/sources', requireAuth, (req, res) => {
    try {
        res.json(db.getSourceStats(req.userId));
    } catch (err) { handleError(res, err); }
});

app.get('/api/stats/countries', requireAuth, (req, res) => {
    try {
        res.json(db.getCountryStats(req.userId));
    } catch (err) { handleError(res, err); }
});

// Only auto-start the HTTP listener when this file is run directly (`node
// server.js` / `npm start`). When required from elsewhere — namely the test
// suite, which needs a fresh `app` per test file bound to an ephemeral
// port/DB — importing this module must not have the side effect of binding
// a real port.
if (require.main === module) {
    // Explicit 0.0.0.0 bind — some hosts default a bare app.listen(PORT) to
    // IPv6-only ('::'), which breaks external IPv4 access behind certain
    // VPS network setups/reverse proxies.
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Suivi Prospection running on port ${PORT}`);
    });
}

module.exports = app;
