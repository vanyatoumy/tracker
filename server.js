const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const COOKIE_NAME = 'session_token';
const isProd = process.env.NODE_ENV === 'production';

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

function handleError(res, err) {
    console.error(err);
    res.status(400).json({ error: err.message });
}

function setSessionCookie(res, token, expiresAt) {
    res.cookie(COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: isProd,
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

// ---------- AUTH ROUTES ----------

app.post('/api/auth/register', (req, res) => {
    try {
        const { name, phone, password } = req.body;
        if (!name || !name.trim()) throw new Error('Le nom est requis');
        if (!phone || !phone.trim()) throw new Error('Le numero est requis');
        if (!password || password.length < 6) throw new Error('Mot de passe : 6 caracteres minimum');

        const user = db.createUser({ name: name.trim(), phone: phone.trim(), password });
        const { token, expires_at } = db.createSession(user.id);
        setSessionCookie(res, token, expires_at);
        res.status(201).json(user);
    } catch (err) { handleError(res, err); }
});

app.post('/api/auth/login', (req, res) => {
    try {
        const { phone, password } = req.body;
        const user = db.findUserByPhone((phone || '').trim());
        if (!user || !db.verifyPassword(password || '', user.password_salt, user.password_hash)) {
            throw new Error('Numero ou mot de passe incorrect');
        }
        const { token, expires_at } = db.createSession(user.id);
        setSessionCookie(res, token, expires_at);
        res.json({ id: user.id, name: user.name, phone: user.phone });
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
        const { name, phone, country, city, quarter, facebook_profile_url, source, interest_type, next_followup_at } = req.body;
        if (!name || !name.trim()) throw new Error('Le nom est requis');
        res.status(201).json(db.createProspect(req.userId, {
            name: name.trim(), phone, country, city, quarter, facebook_profile_url, source, interest_type, next_followup_at
        }));
    } catch (err) { handleError(res, err); }
});

app.get('/api/prospects/:id', requireAuth, (req, res) => {
    const p = db.getProspect(req.userId, req.params.id);
    if (!p) return res.status(404).json({ error: 'Introuvable' });
    res.json(p);
});

app.patch('/api/prospects/:id', requireAuth, (req, res) => {
    try {
        if (req.body.name !== undefined && !req.body.name.trim()) {
            throw new Error('Le nom ne peut pas etre vide');
        }
        res.json(db.updateProspect(req.userId, req.params.id, req.body));
    } catch (err) { handleError(res, err); }
});

app.post('/api/prospects/:id/stage', requireAuth, (req, res) => {
    try {
        const { to_stage, note } = req.body;
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
        const { type, content } = req.body;
        if (!content || !content.trim()) throw new Error('Le contenu est requis');
        res.status(201).json(db.addInteraction(req.userId, req.params.id, { type, content: content.trim() }));
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

app.listen(PORT, () => {
    console.log(`Suivi Prospection running: http://localhost:${PORT}`);
});
