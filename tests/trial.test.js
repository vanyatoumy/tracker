// Free trial (FREE_TRIAL_DAYS, default 30): a sign-up is active and logged
// in straight away; the first paid activation turns it into a normal
// subscription. The no-trial setup is covered by auth.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, stopServer, makeClient } = require('./helpers');
const db = require('../db');

test.before(async () => { await startServer(); });
test.after(async () => { await stopServer(); });

const PASSWORD = 'password123';
const DAY = 24 * 60 * 60 * 1000;

test('sign-up starts a 30-day free trial and logs the person in right away', async () => {
    const client = makeClient();
    const res = await client.post('/api/auth/register', { name: 'Nina Kamga', phone: '+237600888001', password: PASSWORD });
    assert.equal(res.status, 201);
    assert.equal(res.body.logged_in, true);
    assert.equal(res.body.is_trial, 1);
    assert.match(res.body.message, /essai gratuit de 30 jours/);
    assert.equal(res.body.token, undefined, 'the web client gets a cookie, never the raw token');

    // Same client, no separate login: the session cookie is already set.
    assert.equal((await client.get('/api/prospects')).status, 200);
    assert.equal((await client.post('/api/prospects', { name: 'Premier contact' })).status, 201);

    const me = (await client.get('/api/auth/me')).body;
    assert.equal(me.is_trial, 1);
    assert.equal(me.is_active, 1);
    const days = (new Date(me.subscription_expires_at) - Date.now()) / DAY;
    assert.ok(days > 29.9 && days <= 30, `expected ~30 days, got ${days}`);

    // And a normal login later works too.
    assert.equal((await makeClient().post('/api/auth/login', { phone: '+237600888001', password: PASSWORD })).status, 200);
});

test('the native app receives its session token on sign-up', async () => {
    // The Android app's WebView origin (see NATIVE_APP_ORIGIN in server.js).
    const client = makeClient({ Origin: 'https://localhost' });
    const reg = await client.post('/api/auth/register', { name: 'App Mobile', phone: '+237600888002', password: PASSWORD });
    assert.equal(reg.status, 201);
    assert.ok(reg.body.token && reg.body.token.length >= 32);
});

test('the first paid activation ends the trial: a full subscription period from that day', async () => {
    const client = makeClient();
    const reg = await client.post('/api/auth/register', { name: 'Paul Etoa', phone: '+237600888003', password: PASSWORD });
    db.setUserActiveById(reg.body.id, true);

    const me = (await client.get('/api/auth/me')).body;
    assert.equal(me.is_trial, 0);
    const days = (new Date(me.subscription_expires_at) - Date.now()) / DAY;
    assert.ok(days > 29.9 && days <= 30);
});

test('subscription info exposes the trial length; the admin list flags trial accounts', async () => {
    const info = (await makeClient().get('/api/subscription/info')).body;
    assert.equal(info.trial_days, 30);

    const reg = await makeClient().post('/api/auth/register', { name: 'Essai Admin', phone: '+237600888004', password: PASSWORD });
    const row = db.adminListUsers().find(u => u.id === reg.body.id);
    assert.equal(row.is_trial, 1);
    assert.equal(row.is_active, 1);
});
