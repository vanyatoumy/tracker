// Lockouts are per (account, client IP): an attacker hammering someone's
// phone number must only lock *themselves* out, not the account's owner.
// This file enables TRUST_PROXY so X-Forwarded-For can stand in for distinct
// client IPs (the other test files all come from 127.0.0.1).
process.env.TRUST_PROXY = 'true';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, stopServer, makeClient } = require('./helpers');
const db = require('../db');

test.before(async () => { await startServer(); });
test.after(async () => { await stopServer(); });

const PASSWORD = 'password123';
const ATTACKER_IP = '203.0.113.5';
const OWNER_IP = '198.51.100.7';

async function lockFrom(ip, phone) {
    const client = makeClient({ 'X-Forwarded-For': ip });
    for (let i = 0; i < 4; i++) {
        await client.post('/api/auth/login', { phone, password: 'nope' });
    }
    return client;
}

test('failures from one IP do not lock the owner out from another IP', async () => {
    const phone = '+237600555001';
    db.createUser({ name: 'Owner', phone, password: PASSWORD });
    db.setUserActive(phone, true);

    const attacker = await lockFrom(ATTACKER_IP, phone);

    const attackerRetry = await attacker.post('/api/auth/login', { phone, password: PASSWORD });
    assert.equal(attackerRetry.status, 401);
    assert.match(attackerRetry.body.error, /bloque/i);

    const owner = makeClient({ 'X-Forwarded-For': OWNER_IP });
    const ownerLogin = await owner.post('/api/auth/login', { phone, password: PASSWORD });
    assert.equal(ownerLogin.status, 200);

    // The owner's successful login doesn't lift the attacker's lockout.
    const attackerAgain = await attacker.post('/api/auth/login', { phone, password: PASSWORD });
    assert.equal(attackerAgain.status, 401);
    assert.match(attackerAgain.body.error, /bloque/i);
});

test('the admin list shows an account as locked while any IP is locked out, and unlock clears every IP', async () => {
    const phone = '+237600555002';
    const user = db.createUser({ name: 'Target', phone, password: PASSWORD });
    db.setUserActive(phone, true);

    await lockFrom(ATTACKER_IP, phone);
    await lockFrom(OWNER_IP, phone);

    const row = db.adminListUsers().find(u => u.id === user.id);
    assert.ok(row.locked_until, 'expected locked_until to be reported');
    assert.ok(new Date(row.locked_until) > new Date());

    db.unlockUserById(user.id);
    assert.equal(db.adminListUsers().find(u => u.id === user.id).locked_until, null);

    for (const ip of [ATTACKER_IP, OWNER_IP]) {
        const res = await makeClient({ 'X-Forwarded-For': ip }).post('/api/auth/login', { phone, password: PASSWORD });
        assert.equal(res.status, 200, `expected ${ip} to be unlocked`);
    }
});
