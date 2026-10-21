const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { startServer, stopServer, makeClient } = require('./helpers');
const db = require('../db');

test.before(async () => { await startServer(); });
test.after(async () => { await stopServer(); });

const PASSWORD = 'password123';

async function loginAs(phone) {
    const client = makeClient();
    const res = await client.post('/api/auth/login', { phone, password: PASSWORD });
    assert.equal(res.status, 200, `expected login to succeed for ${phone}`);
    return client;
}

function makeActiveUser(name, phone) {
    const user = db.createUser({ name, phone, password: PASSWORD });
    db.setUserActive(phone, true);
    return user;
}

test('an admin deactivating an account cuts off its already-open session', async () => {
    const adminPhone = '+237600444001';
    makeActiveUser('Admin', adminPhone);
    db.setUserAdmin(adminPhone, true);
    const target = makeActiveUser('Target', '+237600444002');

    const targetClient = await loginAs('+237600444002');
    assert.equal((await targetClient.get('/api/prospects')).status, 200);

    const admin = await loginAs(adminPhone);
    const deactivate = await admin.post(`/api/admin/users/${target.id}/activate`, { active: false });
    assert.equal(deactivate.status, 200);

    const res = await targetClient.get('/api/prospects');
    assert.equal(res.status, 401);
    const me = await targetClient.get('/api/auth/me');
    assert.equal(me.status, 401);
});

test('deactivating from the CLI helper also cuts off open sessions', async () => {
    const phone = '+237600444003';
    makeActiveUser('Cli', phone);
    const client = await loginAs(phone);

    db.setUserActive(phone, false);

    // Deactivation deleted the session outright, so it reads as expired.
    const res = await client.get('/api/prospects');
    assert.equal(res.status, 401);
});

test('a subscription lapsing mid-session blocks the next request with the renewal message', async () => {
    const phone = '+237600444004';
    const user = makeActiveUser('Lapsed', phone);
    const client = await loginAs(phone);
    assert.equal((await client.get('/api/prospects')).status, 200);

    // Simulate the subscription window running out while the session (which
    // lasts longer) is still valid. Separate connection to the same test DB.
    const raw = new DatabaseSync(process.env.DB_PATH);
    raw.prepare(`UPDATE users SET subscription_expires_at = ? WHERE id = ?`)
        .run(new Date(Date.now() - 60 * 1000).toISOString(), user.id);
    raw.close();

    const res = await client.get('/api/prospects');
    assert.equal(res.status, 401);
    assert.match(res.body.error, /abonnement a expire/i);

    // The account is flipped inactive and the session is gone for good:
    // renewing (re-activating) does not resurrect the old session.
    assert.equal(db.getUserById(user.id).is_active, 0);
    db.setUserActive(phone, true);
    assert.equal((await client.get('/api/prospects')).status, 401);
});

test('an active account keeps working normally, and /me returns the user', async () => {
    const phone = '+237600444005';
    makeActiveUser('Happy', phone);
    const client = await loginAs(phone);

    const me = await client.get('/api/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.phone, phone);
    assert.equal((await client.get('/api/prospects')).status, 200);
});
