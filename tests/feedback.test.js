const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { startServer, stopServer, makeClient } = require('./helpers');
const db = require('../db');

test.before(async () => { await startServer(); });
test.after(async () => { await stopServer(); });

const PASSWORD = 'password123';
let phoneSeq = 0;

async function freshUser({ admin = false } = {}) {
    const phone = `+2376007770${String(50 + ++phoneSeq)}`;
    const user = db.createUser({ name: admin ? 'Admin Avis' : 'Utilisatrice Avis', phone, password: PASSWORD });
    db.setUserActive(phone, true);
    if (admin) db.setUserAdmin(phone, true);
    const client = makeClient();
    assert.equal((await client.post('/api/auth/login', { phone, password: PASSWORD })).status, 200);
    return { client, user, phone };
}

test('a user sends feedback; the admin sees it with name and phone, newest first', async () => {
    const { client, user, phone } = await freshUser();
    const first = await client.post('/api/feedback', { type: 'idee', message: 'Un export Excel serait top', platform: 'android', app_version: '1.2' });
    assert.equal(first.status, 201);
    assert.equal(first.body.status, 'nouveau');
    await client.post('/api/feedback', { type: 'probleme', message: 'La recherche ne trouve pas les accents' });

    const { client: admin } = await freshUser({ admin: true });
    const list = await admin.get('/api/admin/feedback');
    assert.equal(list.status, 200);
    const mine = list.body.filter(f => f.user_id === user.id);
    assert.deepEqual(mine.map(f => f.type), ['probleme', 'idee']);
    assert.equal(mine[1].user_phone, phone);
    assert.equal(mine[1].platform, 'android');
    assert.equal(mine[1].app_version, '1.2');
});

test('feedback validation: type and message are required, type must be known', async () => {
    const { client } = await freshUser();
    assert.equal((await client.post('/api/feedback', { message: 'Sans type' })).status, 400);
    assert.equal((await client.post('/api/feedback', { type: 'idee', message: '   ' })).status, 400);
    assert.equal((await client.post('/api/feedback', { type: 'plainte', message: 'Type inconnu' })).status, 400);
    assert.equal((await client.post('/api/feedback', { type: 'idee', message: 'x'.repeat(2001) })).status, 400);
    assert.equal((await makeClient().post('/api/feedback', { type: 'idee', message: 'Pas connecte' })).status, 401);
});

test('admin marks feedback handled and reopens it; non-admins cannot list or change it', async () => {
    const { client } = await freshUser();
    const sent = (await client.post('/api/feedback', { type: 'question', message: 'Comment importer ?' })).body;

    assert.equal((await client.get('/api/admin/feedback')).status, 403);
    assert.equal((await client.post(`/api/admin/feedback/${sent.id}/status`, { status: 'traite' })).status, 403);

    const { client: admin } = await freshUser({ admin: true });
    const handled = await admin.post(`/api/admin/feedback/${sent.id}/status`, { status: 'traite' });
    assert.equal(handled.status, 200);
    assert.equal(handled.body.status, 'traite');
    assert.ok(handled.body.handled_at);

    const reopened = await admin.post(`/api/admin/feedback/${sent.id}/status`, { status: 'nouveau' });
    assert.equal(reopened.body.handled_at, null);
    assert.equal((await admin.post(`/api/admin/feedback/${sent.id}/status`, { status: 'archive' })).status, 400);
    assert.equal((await admin.post('/api/admin/feedback/nope/status', { status: 'traite' })).status, 404);
});

test('a user in the subscription grace period (read-only) can still send feedback', async () => {
    const { client, user } = await freshUser();
    const raw = new DatabaseSync(process.env.DB_PATH);
    raw.prepare(`UPDATE users SET subscription_expires_at = ? WHERE id = ?`)
        .run(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), user.id);
    raw.close();

    assert.equal((await client.post('/api/prospects', { name: 'Bloque' })).status, 403);
    assert.equal((await client.post('/api/feedback', { type: 'question', message: 'Comment renouveler ?' })).status, 201);
});

test('feedback is rate-limited per user (10 per hour)', async () => {
    const { client } = await freshUser();
    for (let i = 0; i < 10; i++) {
        assert.equal((await client.post('/api/feedback', { type: 'autre', message: `Message ${i}` })).status, 201);
    }
    assert.equal((await client.post('/api/feedback', { type: 'autre', message: 'Un de trop' })).status, 429);
    // Another user is not affected by the first one's limit.
    const { client: other } = await freshUser();
    assert.equal((await other.post('/api/feedback', { type: 'autre', message: 'Moi aussi' })).status, 201);
});
