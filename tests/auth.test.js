// This file covers the no-trial setup (FREE_TRIAL_DAYS=0): sign-ups wait
// for the admin's activation. The free-trial flow is in trial.test.js.
process.env.FREE_TRIAL_DAYS = '0';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, stopServer, makeClient } = require('./helpers');
const db = require('../db');

test.before(async () => { await startServer(); });
test.after(async () => { await stopServer(); });

const PHONE = '+237600111001';
const PASSWORD = 'password123';

test('register creates an inactive account and does not log in', async () => {
    const client = makeClient();
    const res = await client.post('/api/auth/register', { name: 'Alice', phone: PHONE, password: PASSWORD });

    assert.equal(res.status, 201);
    assert.equal(res.body.is_active, 0);
    assert.match(res.body.message, /active/i);

    // No session should have been issued — hitting an authenticated route
    // right after registering must fail.
    const me = await client.get('/api/prospects');
    assert.equal(me.status, 401);
});

test('login is rejected for an inactive account with a specific message', async () => {
    const client = makeClient();
    const res = await client.post('/api/auth/login', { phone: PHONE, password: PASSWORD });
    assert.equal(res.status, 401);
    assert.match(res.body.error, /active/i);
});

test('login rejects wrong password with a specific (non-generic) message', async () => {
    const client = makeClient();
    const res = await client.post('/api/auth/login', { phone: PHONE, password: 'wrong-password' });
    assert.equal(res.status, 401);
    assert.equal(res.body.error, 'Numero ou mot de passe incorrect');
});

test('login rejects an unknown phone number the same way as a wrong password', async () => {
    const client = makeClient();
    const res = await client.post('/api/auth/login', { phone: '+237699999999', password: 'whatever' });
    assert.equal(res.status, 401);
    assert.equal(res.body.error, 'Numero ou mot de passe incorrect');
});

test('after activation, correct credentials log in and grant a working session', async () => {
    db.setUserActive(PHONE, true);

    const client = makeClient();
    const login = await client.post('/api/auth/login', { phone: PHONE, password: PASSWORD });
    assert.equal(login.status, 200);
    assert.equal(login.body.phone, PHONE);
    assert.equal(login.body.is_admin, false);

    const prospects = await client.get('/api/prospects');
    assert.equal(prospects.status, 200);
    assert.deepEqual(prospects.body, []);
});

test('logout clears the session so subsequent requests are unauthenticated', async () => {
    const phone = '+237600111003';
    db.createUser({ name: 'Bob', phone, password: PASSWORD });
    db.setUserActive(phone, true);

    const client = makeClient();
    const login = await client.post('/api/auth/login', { phone, password: PASSWORD });
    assert.equal(login.status, 200);

    const before = await client.get('/api/prospects');
    assert.equal(before.status, 200);

    const logout = await client.post('/api/auth/logout');
    assert.equal(logout.status, 204);

    const after = await client.get('/api/prospects');
    assert.equal(after.status, 401);
});

test('registering the same phone number twice is rejected', async () => {
    const client = makeClient();
    const res = await client.post('/api/auth/register', { name: 'Alice Again', phone: PHONE, password: PASSWORD });
    assert.equal(res.status, 409);
});
