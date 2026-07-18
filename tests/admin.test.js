const test = require('node:test');
const assert = require('node:assert/strict');
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

test('unauthenticated requests to admin routes are rejected with 401', async () => {
    const client = makeClient();
    const res = await client.get('/api/admin/users');
    assert.equal(res.status, 401);
});

test('an authenticated non-admin is rejected with 403', async () => {
    const phone = '+237600333001';
    db.createUser({ name: 'Regular', phone, password: PASSWORD });
    db.setUserActive(phone, true);

    const client = await loginAs(phone);
    const res = await client.get('/api/admin/users');
    assert.equal(res.status, 403);
});

test('an admin can list users, activate an account, and unlock a lockout', async () => {
    const adminPhone = '+237600333002';
    db.createUser({ name: 'Admin', phone: adminPhone, password: PASSWORD });
    db.setUserActive(adminPhone, true);
    db.setUserAdmin(adminPhone, true);

    const targetPhone = '+237600333003';
    const target = db.createUser({ name: 'Target', phone: targetPhone, password: PASSWORD });
    // left inactive on purpose

    const admin = await loginAs(adminPhone);

    const list = await admin.get('/api/admin/users');
    assert.equal(list.status, 200);
    const targetRow = list.body.find((u) => u.id === target.id);
    assert.ok(targetRow, 'target user should appear in the admin list');
    assert.equal(targetRow.is_active, 0);

    const activate = await admin.post(`/api/admin/users/${target.id}/activate`, { active: true });
    assert.equal(activate.status, 200);
    assert.equal(activate.body.is_active, 1);

    // Target can now log in.
    const targetClient = makeClient();
    const targetLogin = await targetClient.post('/api/auth/login', { phone: targetPhone, password: PASSWORD });
    assert.equal(targetLogin.status, 200);

    // Lock the target out, then have the admin unlock it via HTTP.
    for (let i = 0; i < 4; i++) {
        await makeClient().post('/api/auth/login', { phone: targetPhone, password: 'nope' });
    }
    const stillLocked = await makeClient().post('/api/auth/login', { phone: targetPhone, password: PASSWORD });
    assert.equal(stillLocked.status, 401);

    const unlock = await admin.post(`/api/admin/users/${target.id}/unlock`);
    assert.equal(unlock.status, 200);

    const afterUnlock = await makeClient().post('/api/auth/login', { phone: targetPhone, password: PASSWORD });
    assert.equal(afterUnlock.status, 200);
});

test('an admin deactivating an account blocks its next login', async () => {
    const adminPhone = '+237600333004';
    db.createUser({ name: 'Admin2', phone: adminPhone, password: PASSWORD });
    db.setUserActive(adminPhone, true);
    db.setUserAdmin(adminPhone, true);

    const targetPhone = '+237600333005';
    const target = db.createUser({ name: 'Target2', phone: targetPhone, password: PASSWORD });
    db.setUserActive(targetPhone, true);

    const admin = await loginAs(adminPhone);
    const deactivate = await admin.post(`/api/admin/users/${target.id}/activate`, { active: false });
    assert.equal(deactivate.status, 200);
    assert.equal(deactivate.body.is_active, 0);

    const res = await makeClient().post('/api/auth/login', { phone: targetPhone, password: PASSWORD });
    assert.equal(res.status, 401);
    assert.match(res.body.error, /active/i);
});
