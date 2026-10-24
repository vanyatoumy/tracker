const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, stopServer, makeClient } = require('./helpers');
const db = require('../db');

test.before(async () => { await startServer(); });
test.after(async () => { await stopServer(); });

const PASSWORD = 'password123';
let phoneSeq = 0;

// Each test gets its own account so stats don't bleed between tests.
async function freshUser() {
    const phone = `+2376007770${String(++phoneSeq).padStart(2, '0')}`;
    db.createUser({ name: 'Stats', phone, password: PASSWORD });
    db.setUserActive(phone, true);
    const client = makeClient();
    const res = await client.post('/api/auth/login', { phone, password: PASSWORD });
    assert.equal(res.status, 200);
    return client;
}

async function addProspect(client, fields) {
    const res = await client.post('/api/prospects', fields);
    assert.equal(res.status, 201);
    return res.body;
}

async function moveTo(client, id, stage) {
    const res = await client.post(`/api/prospects/${id}/stage`, { to_stage: stage });
    assert.equal(res.status, 200);
    return res.body;
}

test('a contact converted twice (client then partenaire) counts as one conversion', async () => {
    const client = await freshUser();
    const p = await addProspect(client, { name: 'Double' });
    await moveTo(client, p.id, 'client');
    await moveTo(client, p.id, 'partenaire');

    const bench = await client.get('/api/stats/benchmark');
    assert.equal(bench.status, 200);
    assert.equal(bench.body.count, 1);
});

test('contacts marked lost still count in the source and country conversion rates', async () => {
    const client = await freshUser();
    const won = await addProspect(client, { name: 'Won', source: 'facebook', country: 'Cameroun' });
    await moveTo(client, won.id, 'client');
    const lost = await addProspect(client, { name: 'Lost', source: 'facebook', country: 'Cameroun' });
    await client.post(`/api/prospects/${lost.id}/archive`, { archived: true });

    const sources = await client.get('/api/stats/sources');
    const fb = sources.body.find(s => s.source === 'facebook');
    assert.deepEqual({ total: fb.total, converted: fb.converted, rate: fb.conversion_rate }, { total: 2, converted: 1, rate: 50 });

    const countries = await client.get('/api/stats/countries');
    const cm = countries.body.find(c => c.country === 'Cameroun');
    assert.deepEqual({ total: cm.total, converted: cm.converted, rate: cm.conversion_rate }, { total: 2, converted: 1, rate: 50 });
});

test('moving a contact to the stage it is already in records nothing', async () => {
    const client = await freshUser();
    const p = await addProspect(client, { name: 'Same' });
    await moveTo(client, p.id, 'contacte');
    const before = await client.get(`/api/prospects/${p.id}`);

    const again = await moveTo(client, p.id, 'contacte');
    assert.equal(again.stage_updated_at, before.body.stage_updated_at);

    const history = await client.get(`/api/prospects/${p.id}/history`);
    assert.deepEqual(history.body.map(h => h.to_stage), ['nouveau', 'contacte']);
});

test('activity: counts actions, new contacts, stage advances, conversions, revenue and the funnel', async () => {
    const client = await freshUser();
    const a = await addProspect(client, { name: 'A' });
    const b = await addProspect(client, { name: 'B' });
    await addProspect(client, { name: 'C' });
    await client.post(`/api/prospects/${a.id}/interactions`, { type: 'message', content: 'Salut' });
    await client.post(`/api/prospects/${a.id}/interactions`, { type: 'appel', content: 'Appel' });
    await client.post(`/api/prospects/${b.id}/interactions`, { type: 'note', content: 'Note perso' });
    await moveTo(client, a.id, 'contacte');
    await moveTo(client, a.id, 'client');      // skips stages: still passes them in the funnel
    await moveTo(client, b.id, 'interesse');
    await moveTo(client, b.id, 'contacte');    // a step back is not an advance
    await client.post(`/api/prospects/${a.id}/purchases`, { amount: 12000 });
    await client.post(`/api/prospects/${a.id}/purchases`, { amount: 3000 });

    const res = await client.get('/api/stats/activity?days=30');
    assert.equal(res.status, 200);
    const s = res.body;
    assert.deepEqual(s.interactions, { message: 1, appel: 1, rencontre: 0, note: 1 });
    assert.equal(s.actions, 2, 'notes are not outreach');
    assert.equal(s.last_7_days_actions, 2);
    assert.equal(s.new_contacts, 3);
    assert.equal(s.stage_advances, 3);
    assert.equal(s.conversions, 1);
    assert.deepEqual({ purchases: s.purchases, revenue: s.revenue }, { purchases: 2, revenue: 15000 });
    assert.deepEqual(s.funnel.map(f => [f.stage, f.count]), [
        ['nouveau', 3], ['contacte', 2], ['prospect', 2], ['interesse', 2], ['en_decision', 1], ['converti', 1]
    ]);
});

test('stats period: ?days filters by date, and is validated', async () => {
    const client = await freshUser();
    const p = await addProspect(client, { name: 'Vieux', source: 'facebook' });
    await client.post(`/api/prospects/${p.id}/purchases`, { purchased_at: '2020-01-01T12:00:00.000Z', amount: 5000 });

    const recent = (await client.get('/api/stats/activity?days=7')).body;
    assert.equal(recent.revenue, 0, 'a purchase from 2020 is outside the last 7 days');
    assert.equal((await client.get('/api/stats/activity')).body.revenue, 5000);
    assert.equal((await client.get('/api/stats/sources?days=7')).body[0].total, 1);
    assert.equal((await client.get('/api/stats/activity?days=abc')).status, 400);
});

test('weekly goal: set on the account, returned by /me, cleared with null', async () => {
    const client = await freshUser();
    const set = await client.patch('/api/auth/me', { weekly_goal: 25 });
    assert.equal(set.status, 200);
    assert.equal((await client.get('/api/auth/me')).body.weekly_goal, 25);
    assert.equal((await client.patch('/api/auth/me', { weekly_goal: 0 })).status, 400);
    assert.equal((await client.patch('/api/auth/me', { weekly_goal: null })).body.weekly_goal, null);
});
