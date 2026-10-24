const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, stopServer, makeClient } = require('./helpers');
const db = require('../db');

test.before(async () => { await startServer(); });
test.after(async () => { await stopServer(); });

const PASSWORD = 'password123';
let phoneSeq = 0;

async function freshUser() {
    const phone = `+2376008880${String(++phoneSeq).padStart(2, '0')}`;
    db.createUser({ name: 'Rep', phone, password: PASSWORD });
    db.setUserActive(phone, true);
    const client = makeClient();
    const res = await client.post('/api/auth/login', { phone, password: PASSWORD });
    assert.equal(res.status, 200);
    return client;
}

// ---------- templates ----------

test('templates: create, list (sorted by name), update, delete', async () => {
    const client = await freshUser();
    const b = await client.post('/api/templates', { name: 'Relance', body: 'Bonjour {prenom}, tu as pu reflechir ?' });
    assert.equal(b.status, 201);
    const a = await client.post('/api/templates', { name: 'Accueil', body: 'Salut {prenom} !' });
    assert.equal(a.status, 201);

    const list = await client.get('/api/templates');
    assert.deepEqual(list.body.map(t => t.name), ['Accueil', 'Relance']);

    const updated = await client.patch(`/api/templates/${b.body.id}`, { body: 'Nouveau texte' });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.name, 'Relance');
    assert.equal(updated.body.body, 'Nouveau texte');

    assert.equal((await client.delete(`/api/templates/${a.body.id}`)).status, 204);
    assert.deepEqual((await client.get('/api/templates')).body.map(t => t.name), ['Relance']);
});

test('templates: name and text are required', async () => {
    const client = await freshUser();
    assert.equal((await client.post('/api/templates', { name: 'Vide', body: '   ' })).status, 400);
    assert.equal((await client.post('/api/templates', { body: 'Sans nom' })).status, 400);
});

test("templates: users never see or change each other's templates", async () => {
    const alice = await freshUser();
    const bob = await freshUser();
    const t = await alice.post('/api/templates', { name: 'Prive', body: 'Texte' });

    assert.deepEqual((await bob.get('/api/templates')).body, []);
    assert.equal((await bob.patch(`/api/templates/${t.body.id}`, { body: 'Pirate' })).status, 404);
    await bob.delete(`/api/templates/${t.body.id}`);
    assert.equal((await alice.get('/api/templates')).body[0].body, 'Texte');
});

// ---------- purchases ----------

test('purchases: recorded, listed newest first, and exposed as last_purchase_at on the prospect', async () => {
    const client = await freshUser();
    const p = (await client.post('/api/prospects', { name: 'Cliente' })).body;
    assert.equal(p.last_purchase_at, null);

    const older = await client.post(`/api/prospects/${p.id}/purchases`, { purchased_at: '2026-08-01T10:00:00.000Z', product: 'Aloe gel', amount: 15000 });
    assert.equal(older.status, 201);
    const newer = await client.post(`/api/prospects/${p.id}/purchases`, { purchased_at: '2026-09-01T10:00:00.000Z', product: 'The', amount: '8500' });
    assert.equal(newer.status, 201);
    assert.equal(newer.body.amount, 8500);

    const list = await client.get(`/api/prospects/${p.id}/purchases`);
    assert.deepEqual(list.body.map(x => x.product), ['The', 'Aloe gel']);

    const one = await client.get(`/api/prospects/${p.id}`);
    assert.equal(one.body.last_purchase_at, '2026-09-01T10:00:00.000Z');
    const all = await client.get('/api/prospects');
    assert.equal(all.body.find(x => x.id === p.id).last_purchase_at, '2026-09-01T10:00:00.000Z');

    assert.equal((await client.delete(`/api/prospects/${p.id}/purchases/${newer.body.id}`)).status, 204);
    assert.equal((await client.get(`/api/prospects/${p.id}`)).body.last_purchase_at, '2026-08-01T10:00:00.000Z');
});

test('purchases: date defaults to now, amount must be a positive number', async () => {
    const client = await freshUser();
    const p = (await client.post('/api/prospects', { name: 'Client' })).body;

    const before = Date.now();
    const res = await client.post(`/api/prospects/${p.id}/purchases`, {});
    assert.equal(res.status, 201);
    assert.ok(new Date(res.body.purchased_at).getTime() >= before - 1000);

    assert.equal((await client.post(`/api/prospects/${p.id}/purchases`, { amount: -5 })).status, 400);
    assert.equal((await client.post(`/api/prospects/${p.id}/purchases`, { amount: 'beaucoup' })).status, 400);
});

test("purchases: can't be read or added on someone else's contact", async () => {
    const alice = await freshUser();
    const bob = await freshUser();
    const p = (await alice.post('/api/prospects', { name: 'A Alice' })).body;

    assert.equal((await bob.get(`/api/prospects/${p.id}/purchases`)).status, 404);
    assert.equal((await bob.post(`/api/prospects/${p.id}/purchases`, { product: 'X' })).status, 404);
});

test('reorder interval: set, cleared, and validated (whole days, 1 to 365)', async () => {
    const client = await freshUser();
    const p = (await client.post('/api/prospects', { name: 'Reachat' })).body;

    assert.equal((await client.patch(`/api/prospects/${p.id}`, { reorder_interval_days: 30 })).body.reorder_interval_days, 30);
    assert.equal((await client.patch(`/api/prospects/${p.id}`, { reorder_interval_days: null })).body.reorder_interval_days, null);
    assert.equal((await client.patch(`/api/prospects/${p.id}`, { reorder_interval_days: 0 })).status, 400);
    assert.equal((await client.patch(`/api/prospects/${p.id}`, { reorder_interval_days: 2.5 })).status, 400);
});

test('birthday and temperature: set, cleared, and validated', async () => {
    const client = await freshUser();
    const p = (await client.post('/api/prospects', { name: 'Fete' })).body;

    const set = await client.patch(`/api/prospects/${p.id}`, { birthday: '1990-02-28', temperature: 'chaud' });
    assert.equal(set.status, 200);
    assert.deepEqual({ b: set.body.birthday, t: set.body.temperature }, { b: '1990-02-28', t: 'chaud' });

    assert.equal((await client.patch(`/api/prospects/${p.id}`, { birthday: '1990-02-30' })).status, 400);
    assert.equal((await client.patch(`/api/prospects/${p.id}`, { birthday: '28/02/1990' })).status, 400);
    assert.equal((await client.patch(`/api/prospects/${p.id}`, { temperature: 'brulant' })).status, 400);

    const cleared = await client.patch(`/api/prospects/${p.id}`, { birthday: '', temperature: null });
    assert.deepEqual({ b: cleared.body.birthday, t: cleared.body.temperature }, { b: null, t: null });
});
