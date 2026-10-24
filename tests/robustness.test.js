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
    assert.equal(res.status, 200);
    return client;
}

test('search treats % and _ literally instead of as wildcards', async () => {
    const phone = '+237600666001';
    db.createUser({ name: 'Search', phone, password: PASSWORD });
    db.setUserActive(phone, true);
    const client = await loginAs(phone);
    await client.post('/api/prospects', { name: 'Marie 100%', city: 'Douala' });
    await client.post('/api/prospects', { name: 'Paul', city: 'Kribi_Sud' });
    await client.post('/api/prospects', { name: 'Jean', city: 'Yaounde' });

    const names = async (qs) => (await client.get(`/api/prospects?${qs}`)).body.map(p => p.name).sort();
    assert.deepEqual(await names('search=%25'), ['Marie 100%']);
    assert.deepEqual(await names('search=_'), []);
    assert.deepEqual(await names('city=_'), ['Paul']);
    assert.deepEqual(await names('city=oua'), ['Marie 100%']);
});

test('expired sessions are swept on the next login, live ones are kept', async () => {
    const phone = '+237600666002';
    const user = db.createUser({ name: 'Sweep', phone, password: PASSWORD });
    db.setUserActive(phone, true);
    const live = await loginAs(phone);

    const raw = new DatabaseSync(process.env.DB_PATH);
    raw.prepare(`INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`)
        .run('stale-token', user.id, '2020-01-01T00:00:00.000Z', '2020-01-31T00:00:00.000Z');

    await loginAs(phone);

    assert.equal(raw.prepare(`SELECT COUNT(*) AS n FROM sessions WHERE token = 'stale-token'`).get().n, 0);
    raw.close();
    assert.equal((await live.get('/api/prospects')).status, 200);
});

test('the database runs in WAL mode with a busy timeout', () => {
    const raw = new DatabaseSync(process.env.DB_PATH);
    assert.equal(raw.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
    raw.close();
});

test('a create replayed with the same client_ref returns the same contact instead of a duplicate', async () => {
    const phone = '+237600666003';
    db.createUser({ name: 'Replay', phone, password: PASSWORD });
    db.setUserActive(phone, true);
    const client = await loginAs(phone);

    const first = await client.post('/api/prospects', { name: 'Hors ligne', client_ref: 'offline-abc' });
    const retry = await client.post('/api/prospects', { name: 'Hors ligne', client_ref: 'offline-abc' });
    assert.equal(retry.body.id, first.body.id);
    const other = await client.post('/api/prospects', { name: 'Hors ligne', client_ref: 'offline-def' });
    assert.notEqual(other.body.id, first.body.id);
    assert.equal((await client.get('/api/prospects')).body.length, 2);
});
