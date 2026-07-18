const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, stopServer, makeClient } = require('./helpers');
const db = require('../db');

test.before(async () => { await startServer(); });
test.after(async () => { await stopServer(); });

const PHONE = '+237600222001';
const PASSWORD = 'password123';

test.before(() => {
    db.createUser({ name: 'Carla', phone: PHONE, password: PASSWORD });
    db.setUserActive(PHONE, true);
});

test('3 consecutive wrong passwords do not lock the account yet', async () => {
    const client = makeClient();
    for (let i = 0; i < 3; i++) {
        const res = await client.post('/api/auth/login', { phone: PHONE, password: 'nope' });
        assert.equal(res.status, 401);
        assert.equal(res.body.error, 'Numero ou mot de passe incorrect');
    }
    // Correct password on the 4th attempt should still succeed — no lockout yet.
    const res = await client.post('/api/auth/login', { phone: PHONE, password: PASSWORD });
    assert.equal(res.status, 200);
});

test('4 consecutive wrong passwords lock the account, even with the right password after', async () => {
    const phone = '+237600222002';
    db.createUser({ name: 'Dave', phone, password: PASSWORD });
    db.setUserActive(phone, true);

    const client = makeClient();
    for (let i = 0; i < 4; i++) {
        await client.post('/api/auth/login', { phone, password: 'nope' });
    }

    const res = await client.post('/api/auth/login', { phone, password: PASSWORD });
    assert.equal(res.status, 401);
    assert.match(res.body.error, /bloque/i);
});

test('a locked account stays locked across separate connection attempts (not per-session)', async () => {
    const phone = '+237600222003';
    db.createUser({ name: 'Eve', phone, password: PASSWORD });
    db.setUserActive(phone, true);

    const attacker = makeClient();
    for (let i = 0; i < 4; i++) {
        await attacker.post('/api/auth/login', { phone, password: 'nope' });
    }

    // A different client (fresh cookie jar) hitting the same account should
    // also see the lockout — it's tied to the account, not a session.
    const owner = makeClient();
    const res = await owner.post('/api/auth/login', { phone, password: PASSWORD });
    assert.equal(res.status, 401);
    assert.match(res.body.error, /bloque/i);
});

test('admin unlock clears the lockout and lets the correct password back in', async () => {
    const phone = '+237600222004';
    const created = db.createUser({ name: 'Frank', phone, password: PASSWORD });
    db.setUserActive(phone, true);

    const client = makeClient();
    for (let i = 0; i < 4; i++) {
        await client.post('/api/auth/login', { phone, password: 'nope' });
    }
    const stillLocked = await client.post('/api/auth/login', { phone, password: PASSWORD });
    assert.equal(stillLocked.status, 401);

    db.unlockUserById(created.id);

    const res = await client.post('/api/auth/login', { phone, password: PASSWORD });
    assert.equal(res.status, 200);
});
