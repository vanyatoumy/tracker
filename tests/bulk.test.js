const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, stopServer, makeClient } = require('./helpers');
const db = require('../db');

test.before(async () => { await startServer(); });
test.after(async () => { await stopServer(); });

const PASSWORD = 'password123';
let phoneSeq = 0;

async function freshUser() {
    const phone = `+2376009990${String(++phoneSeq).padStart(2, '0')}`;
    db.createUser({ name: 'Bulk', phone, password: PASSWORD });
    db.setUserActive(phone, true);
    const client = makeClient();
    assert.equal((await client.post('/api/auth/login', { phone, password: PASSWORD })).status, 200);
    return client;
}

async function addMany(client, n) {
    const out = [];
    for (let i = 0; i < n; i++) out.push((await client.post('/api/prospects', { name: `C${i}` })).body);
    return out;
}

test('bulk stage move: logs one history line per moved contact, none for those already there', async () => {
    const client = await freshUser();
    const [a, b, c] = await addMany(client, 3);
    await client.post(`/api/prospects/${c.id}/stage`, { to_stage: 'contacte' });

    const res = await client.post('/api/prospects/bulk', { ids: [a.id, b.id, c.id], action: 'stage', value: 'contacte' });
    assert.equal(res.status, 200);
    assert.equal(res.body.updated, 3);
    assert.ok(res.body.prospects.every(p => p.stage === 'contacte'));

    for (const p of [a, b, c]) {
        const history = (await client.get(`/api/prospects/${p.id}/history`)).body.map(h => h.to_stage);
        assert.deepEqual(history, ['nouveau', 'contacte']);
    }
});

test('bulk archive, temperature and follow-up (set and clear)', async () => {
    const client = await freshUser();
    const ps = await addMany(client, 3);
    const ids = ps.map(p => p.id);

    await client.post('/api/prospects/bulk', { ids, action: 'temperature', value: 'chaud' });
    const due = '2026-11-01T08:00:00.000Z';
    await client.post('/api/prospects/bulk', { ids, action: 'followup', value: due });
    let list = (await client.get('/api/prospects')).body;
    assert.ok(list.every(p => p.temperature === 'chaud' && p.next_followup_at === due));

    await client.post('/api/prospects/bulk', { ids, action: 'followup', value: null });
    await client.post('/api/prospects/bulk', { ids, action: 'temperature', value: null });
    list = (await client.get('/api/prospects')).body;
    assert.ok(list.every(p => p.temperature === null && p.next_followup_at === null));

    await client.post('/api/prospects/bulk', { ids: ids.slice(0, 2), action: 'archive' });
    assert.equal((await client.get('/api/prospects')).body.length, 1);
    await client.post('/api/prospects/bulk', { ids: ids.slice(0, 2), action: 'archive', value: false });
    assert.equal((await client.get('/api/prospects')).body.length, 3);
});

test("bulk never touches someone else's contacts", async () => {
    const alice = await freshUser();
    const bob = await freshUser();
    const [mine] = await addMany(alice, 1);
    const [theirs] = await addMany(bob, 1);

    const res = await alice.post('/api/prospects/bulk', { ids: [mine.id, theirs.id], action: 'archive' });
    assert.equal(res.body.updated, 1);
    assert.equal((await bob.get('/api/prospects')).body.length, 1, "Bob's contact is untouched");
});

test('bulk: validation of ids, action and value', async () => {
    const client = await freshUser();
    const [p] = await addMany(client, 1);
    const post = (body) => client.post('/api/prospects/bulk', body);

    assert.equal((await post({ ids: [], action: 'archive' })).status, 400);
    assert.equal((await post({ ids: 'x', action: 'archive' })).status, 400);
    assert.equal((await post({ ids: [p.id], action: 'delete' })).status, 400);
    assert.equal((await post({ ids: [p.id] })).status, 400);
    assert.equal((await post({ ids: [p.id], action: 'stage' })).status, 400);
    assert.equal((await post({ ids: [p.id], action: 'stage', value: '' })).status, 400);
    assert.equal((await post({ ids: [p.id], action: 'temperature', value: 'brulant' })).status, 400);
    assert.equal((await post({ ids: Array(5001).fill(p.id), action: 'archive' })).status, 400);
});

test('bulk accepts a large selection (body over the default 100kb limit)', async () => {
    const client = await freshUser();
    const [p] = await addMany(client, 1);
    const ids = [p.id, ...Array.from({ length: 4000 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)];
    const res = await client.post('/api/prospects/bulk', { ids, action: 'temperature', value: 'tiede' });
    assert.equal(res.status, 200);
    assert.equal(res.body.updated, 1);
});
