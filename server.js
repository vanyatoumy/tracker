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
            frameAncestors: ["'self'"]
            // upgradeInsecureRequests left at Helmet's default (enabled) now
            // that TLS is live in front of the app (nginx + certbot on the
            // VPS, see deploy/README.md) — nothing to override anymore.
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
// Bulk actions carry up to 5000 ids (~200kb) — past the default too.
const jsonBodyBulk = express.json({ limit: '1mb' });
app.use((req, res, next) => {
    const parser = req.path === '/api/prospects/import' ? jsonBodyImport
        : req.path === '/api/prospects/bulk' ? jsonBodyBulk
        : jsonBodyDefault;
    parser(req, res, next);
});
app.use((req, res, next) => { if (!req.body || typeof req.body !== 'object') req.body = {}; next(); });
app.use(cookieParser());

// The mobile app is bundled locally (not served from this origin), so its
// requests are cross-origin — Capacitor's local-content origin on Android.
// Now that the API is HTTPS (see deploy/README.md), capacitor.config.json
// no longer overrides androidScheme away from Capacitor's default, which is
// "https" — so the WebView's origin is https://localhost, not http. It
// authenticates via a Bearer token instead of the session cookie (see
// getTokenFromRequest/setSessionCookie below), so this doesn't need
// Access-Control-Allow-Credentials — no cookies cross that boundary.
const NATIVE_APP_ORIGIN = 'https://localhost';
app.use((req, res, next) => {
    if (req.headers.origin === NATIVE_APP_ORIGIN) {
        res.setHeader('Access-Control-Allow-Origin', NATIVE_APP_ORIGIN);
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        if (req.method === 'OPTIONS') return res.sendStatus(204);
    }
    next();
});

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
// The mobile app can't use the session cookie cross-origin (see the CORS
// comment above), so it sends the same session token as a Bearer header
// instead. Web keeps using the cookie unchanged. Either is accepted here —
// same session store, just two ways to present the same token.
function getTokenFromRequest(req) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) return authHeader.slice(7);
    return req.cookies[COOKIE_NAME];
}

// Manual subscription model (no payment gateway — see config.js): every
// admin activation grants a fixed window from that moment. Returns the
// message to refuse access with, or null if the account may use the app.
// Expiry is checked before the plain is_active gate so a lapsed
// subscription gets a distinct "renew" message instead of the generic "not
// yet activated" one. If still marked active past its expiry (e.g. the
// admin hasn't looked at it), it's flipped off right here so it doesn't
// linger as active until some other action catches it.
function accountAccessError(user) {
    if (user.subscription_expires_at && new Date(user.subscription_expires_at) < new Date()) {
        // Within the grace period the account stays usable read-only (see
        // inSubscriptionGrace / requireAuth) — only cut off after it.
        if (inSubscriptionGrace(user) && user.is_active) return null;
        if (user.is_active) db.setUserActiveById(user.id, false);
        return 'Ton abonnement a expire. Contacte l\'administrateur pour le renouveler.';
    }
    if (!user.is_active) {
        return 'Ce compte n\'a pas encore ete active. Contacte l\'administrateur.';
    }
    return null;
}

// Expired, but less than SUBSCRIPTION_GRACE_DAYS ago: readable, no changes.
// A lapse shouldn't feel like losing everything overnight — the admin has
// a few days to get the renewal through (see the admin renewals panel).
function inSubscriptionGrace(user) {
    if (!user.subscription_expires_at) return false;
    const expiresAt = new Date(user.subscription_expires_at).getTime();
    const now = Date.now();
    return expiresAt < now && now < expiresAt + config.SUBSCRIPTION_GRACE_DAYS * 24 * 60 * 60 * 1000;
}

// Checked on every request, not just at login: a session outlives the
// subscription window (SESSION_DURATION_DAYS vs SUBSCRIPTION_DURATION_DAYS)
// and an admin deactivation, so gating only the login would leave already
// logged-in users with full access until their session expired.
function requireAuth(req, res, next) {
    const token = getTokenFromRequest(req);
    if (!token) return res.status(401).json({ error: 'Non authentifie' });
    const session = db.getSession(token);
    if (!session) return res.status(401).json({ error: 'Session expiree, reconnecte-toi' });
    const user = db.getUserById(session.user_id);
    const accessError = user ? accountAccessError(user) : 'Compte introuvable';
    if (accessError) {
        db.deleteSession(token);
        return res.status(401).json({ error: accessError });
    }
    if (req.method !== 'GET' && inSubscriptionGrace(user)) {
        // code lets the mobile offline queue keep (not drop) changes made
        // during the grace period, and replay them once renewed.
        return res.status(403).json({
            error: 'Ton abonnement a expire : lecture seule. Renouvelle-le pour pouvoir modifier tes contacts.',
            code: 'subscription_grace'
        });
    }
    req.userId = user.id;
    req.user = user;
    next();
}

// Must run after requireAuth (needs req.user).
function requireAdmin(req, res, next) {
    if (!req.user.is_admin) {
        return res.status(403).json({ error: 'Acces reserve aux administrateurs' });
    }
    next();
}

// ---------- AUTH ROUTES ----------

// Public (no auth): payment instructions shown both pre-login (right after
// registering, since new accounts need to pay before an admin will activate
// them) and in the logged-in "Mon abonnement" panel. Plain text from
// config/.env — there's no payment gateway, this just tells the user how to
// pay the admin directly. Fields are blank strings if unset in .env; the
// frontend hides the panel entirely when price/instructions are empty.
app.get('/api/subscription/info', (req, res) => {
    res.json({
        price: config.SUBSCRIPTION_PRICE,
        duration_days: config.SUBSCRIPTION_DURATION_DAYS,
        grace_days: config.SUBSCRIPTION_GRACE_DAYS,
        instructions: config.SUBSCRIPTION_PAYMENT_INSTRUCTIONS,
        contact: config.SUBSCRIPTION_CONTACT
    });
});

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
            message: "Compte cree. Effectue le paiement de l'abonnement (voir instructions) puis envoie la preuve a l'administrateur pour qu'il active ton compte."
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
        // credentials error on every attempt while it's locked. The lockout
        // is per (account, IP) — see db.js login_failures — so it only
        // blocks whoever piled up the failures, not the account's owner.
        const lockedUntil = user ? db.getLoginLockedUntil(user.id, req.ip) : null;
        if (lockedUntil) {
            const minutesLeft = Math.ceil((new Date(lockedUntil) - new Date()) / 60000);
            throw new AuthError(`Compte temporairement bloque suite a plusieurs echecs. Reessaie dans ${minutesLeft} minute(s).`);
        }

        if (!user || !db.verifyPassword(password, user.password_salt, user.password_hash)) {
            if (user) db.registerFailedLogin(user.id, req.ip);
            throw new AuthError('Numero ou mot de passe incorrect');
        }

        const accessError = accountAccessError(user);
        if (accessError) throw new AuthError(accessError);

        db.clearFailedLogins(user.id, req.ip);
        const { token, expires_at } = db.createSession(user.id);
        setSessionCookie(res, token, expires_at);
        const body = { id: user.id, name: user.name, phone: user.phone, is_admin: !!user.is_admin, subscription_expires_at: user.subscription_expires_at };
        // Only the native app needs the raw token (it can't use the cookie
        // cross-origin — see the CORS comment above). Putting it in the JSON
        // body for every client, including the web version, would defeat
        // the httpOnly cookie's whole point there: an XSS on the web page
        // could then just read the token straight out of the response.
        if (req.headers.origin === NATIVE_APP_ORIGIN) body.token = token;
        res.json(body);
    } catch (err) { handleError(res, err); }
});

app.post('/api/auth/logout', (req, res) => {
    const token = getTokenFromRequest(req);
    if (token) db.deleteSession(token);
    res.clearCookie(COOKIE_NAME);
    res.status(204).end();
});

app.get('/api/auth/me', requireAuth, (req, res) => {
    res.json(req.user);
});

// The user's own settings — just the weekly activity goal for now.
app.patch('/api/auth/me', requireAuth, (req, res) => {
    try {
        if (!('weekly_goal' in req.body)) return res.json(req.user);
        const goal = validate.number(req.body.weekly_goal, "L'objectif hebdomadaire", { min: 1, max: 1000, integer: true });
        res.json(db.setWeeklyGoal(req.userId, goal ?? null));
    } catch (err) { handleError(res, err); }
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

app.post('/api/admin/users/:id/renewal-reminded', requireAuth, requireAdmin, (req, res) => {
    try {
        res.json(db.markRenewalReminded(req.params.id));
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
        const { archived, stage, source, interest_type, temperature, country, city, quarter, search } = req.query;
        res.json(db.listProspects(req.userId, {
            includeArchived: archived === '1',
            stage: stage || undefined,
            source: source || undefined,
            interest_type: interest_type || undefined,
            temperature: temperature || undefined,
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
        const client_ref = validate.str(body.client_ref, 'La reference client', { maxLength: 100 });

        res.status(201).json(db.createProspect(req.userId, {
            name, phone, alt_phone, country, city, quarter, facebook_profile_url, source, interest_type, next_followup_at, client_ref
        }));
    } catch (err) { handleError(res, err); }
});

// Bulk import straight from a Google Contacts CSV export. Accepts an array
// of raw row objects as produced by parsing that CSV client-side (headers
// like "First Name", "Last Name", "Phone 1 - Value", ...) — phone parsing,
// validation, and country lookup all happen here via google-libphonenumber,
// so users can upload the unmodified Google export with no separate
// conversion step.
// Apply one change to many contacts (board selection mode). Deliberately no
// bulk *delete*: archiving is the bulk-safe "remove", and stays reversible.
app.post('/api/prospects/bulk', requireAuth, (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0 || ids.some(id => typeof id !== 'string')) {
            throw new ValidationError('ids doit etre une liste de contacts');
        }
        if (ids.length > 5000) throw new ValidationError('Maximum 5000 contacts par action');
        // oneOf() maps ''/null to null even when required — guard explicitly.
        const action = validate.oneOf(req.body.action, "L'action", db.BULK_ACTIONS, { required: true });
        if (!action) throw new ValidationError("L'action est requise");
        let value;
        if (action === 'stage') {
            value = validate.oneOf(req.body.value, "L'etape", db.STAGES, { required: true });
            if (!value) throw new ValidationError("L'etape est requise");
        }
        if (action === 'archive') value = req.body.value !== false;
        if (action === 'temperature') value = validate.oneOf(req.body.value, 'La temperature', db.TEMPERATURES) ?? null;
        if (action === 'followup') value = validate.isoDate(req.body.value, 'La date de relance') || null;
        res.json(db.bulkUpdateProspects(req.userId, ids, action, value));
    } catch (err) { handleError(res, err); }
});

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
        if ('reorder_interval_days' in body) fields.reorder_interval_days = validate.number(body.reorder_interval_days, 'Le delai de reachat', { min: 1, max: 365, integer: true });
        if ('birthday' in body) fields.birthday = validate.dateOnly(body.birthday, "La date d'anniversaire");
        if ('temperature' in body) fields.temperature = validate.oneOf(body.temperature, 'La temperature', db.TEMPERATURES);

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

// ---------- PURCHASES ----------

app.get('/api/prospects/:id/purchases', requireAuth, (req, res) => {
    try {
        res.json(db.getPurchases(req.userId, req.params.id));
    } catch (err) { handleError(res, err); }
});

app.post('/api/prospects/:id/purchases', requireAuth, (req, res) => {
    try {
        const purchased_at = validate.isoDate(req.body.purchased_at, "La date d'achat");
        const product = validate.str(req.body.product, 'Le produit', { maxLength: 200 });
        const amount = validate.number(req.body.amount, 'Le montant', { min: 0, max: 1e9 });
        const note = validate.str(req.body.note, 'La note', { maxLength: 1000 });
        res.status(201).json(db.addPurchase(req.userId, req.params.id, { purchased_at, product, amount, note }));
    } catch (err) { handleError(res, err); }
});

app.delete('/api/prospects/:id/purchases/:purchaseId', requireAuth, (req, res) => {
    try {
        db.deletePurchase(req.userId, req.params.id, req.params.purchaseId);
        res.status(204).end();
    } catch (err) { handleError(res, err); }
});

// ---------- MESSAGE TEMPLATES ----------

app.get('/api/templates', requireAuth, (req, res) => {
    try {
        res.json(db.listTemplates(req.userId));
    } catch (err) { handleError(res, err); }
});

app.post('/api/templates', requireAuth, (req, res) => {
    try {
        const name = validate.str(req.body.name, 'Le nom du modele', { required: true, maxLength: 80 });
        const body = validate.str(req.body.body, 'Le texte du modele', { required: true, maxLength: 1000 });
        res.status(201).json(db.createTemplate(req.userId, { name, body }));
    } catch (err) { handleError(res, err); }
});

app.patch('/api/templates/:id', requireAuth, (req, res) => {
    try {
        const fields = {};
        if ('name' in req.body) fields.name = validate.str(req.body.name, 'Le nom du modele', { required: true, maxLength: 80 });
        if ('body' in req.body) fields.body = validate.str(req.body.body, 'Le texte du modele', { required: true, maxLength: 1000 });
        res.json(db.updateTemplate(req.userId, req.params.id, fields));
    } catch (err) { handleError(res, err); }
});

app.delete('/api/templates/:id', requireAuth, (req, res) => {
    try {
        db.deleteTemplate(req.userId, req.params.id);
        res.status(204).end();
    } catch (err) { handleError(res, err); }
});

// ---------- REMINDERS ----------

app.get('/api/reminders', requireAuth, (req, res) => {
    try {
        res.json(db.getDueReminders(req.userId));
    } catch (err) { handleError(res, err); }
});

// ---------- STATS ----------

// Every stats route takes an optional ?days=N period (last N days); without
// it, all history.
function statsSince(req) {
    const days = validate.number(req.query.days, 'La periode', { min: 1, max: 3650, integer: true });
    return days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString() : null;
}

app.get('/api/stats/benchmark', requireAuth, (req, res) => {
    try {
        res.json(db.getConversionBenchmark(req.userId, statsSince(req)));
    } catch (err) { handleError(res, err); }
});

app.get('/api/stats/sources', requireAuth, (req, res) => {
    try {
        res.json(db.getSourceStats(req.userId, statsSince(req)));
    } catch (err) { handleError(res, err); }
});

app.get('/api/stats/countries', requireAuth, (req, res) => {
    try {
        res.json(db.getCountryStats(req.userId, statsSince(req)));
    } catch (err) { handleError(res, err); }
});

app.get('/api/stats/activity', requireAuth, (req, res) => {
    try {
        res.json(db.getActivityStats(req.userId, statsSince(req)));
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
