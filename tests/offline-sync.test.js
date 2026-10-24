// Tests for the mobile app's offline queue replay (public/offline.js).
//
// offline.js is a plain browser script (global OfflineSync, IndexedDB,
// fetch), so it's loaded here into a node:vm sandbox with just enough of a
// browser around it: a minimal in-memory IndexedDB, and a fake fetch that
// plays the API server. Dependency-free, like the rest of the test suite.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto, randomUUID } = require('node:crypto');

const OFFLINE_JS = fs.readFileSync(path.join(__dirname, '..', 'public', 'offline.js'), 'utf8');
const API = 'https://api.test';

// Just the slice of IndexedDB that offline.js uses. Requests complete on a
// microtask, after the caller has attached onsuccess, like the real thing.
function createFakeIndexedDB() {
    const stores = new Map();
    function request(fn) {
        const req = {};
        queueMicrotask(() => {
            try {
                req.result = fn();
                if (req.onsuccess) req.onsuccess();
            } catch (err) {
                req.error = err;
                if (req.onerror) req.onerror();
            }
        });
        return req;
    }
    function storeApi(s) {
        return {
            get: (key) => request(() => structuredClone(s.data.get(key))),
            getAll: () => request(() => [...s.data.values()].map(v => structuredClone(v))),
            put: (value) => request(() => { s.data.set(value[s.keyPath], structuredClone(value)); return value[s.keyPath]; }),
            add: (value) => request(() => {
                const v = structuredClone(value);
                if (s.autoIncrement && v[s.keyPath] === undefined) v[s.keyPath] = ++s.seq;
                s.data.set(v[s.keyPath], v);
                return v[s.keyPath];
            }),
            delete: (key) => request(() => { s.data.delete(key); }),
            count: () => request(() => s.data.size)
        };
    }
    const db = {
        objectStoreNames: { contains: (name) => stores.has(name) },
        createObjectStore: (name, { keyPath, autoIncrement = false }) => {
            stores.set(name, { keyPath, autoIncrement, data: new Map(), seq: 0 });
        },
        transaction: (name) => ({ objectStore: () => storeApi(stores.get(name)) })
    };
    return {
        open: () => {
            const req = {};
            queueMicrotask(() => {
                req.result = db;
                if (req.onupgradeneeded) req.onupgradeneeded();
                if (req.onsuccess) req.onsuccess();
            });
            return req;
        }
    };
}

// A tiny stand-in for the API server's prospect routes. `network.down`
// makes fetch throw (no connectivity); `network.respond` can override the
// response for a given request (e.g. force a 401) before the default
// handler runs.
function createHarness() {
    const prospects = new Map();
    const calls = [];
    const network = { down: false, respond: null };

    function json(status, body) {
        return new Response(body === undefined ? null : JSON.stringify(body), {
            status,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    async function fetch(url, opts = {}) {
        const method = (opts.method || 'GET').toUpperCase();
        const p = new URL(url).pathname;
        const body = opts.body ? JSON.parse(opts.body) : {};
        if (network.down) throw new TypeError('Failed to fetch');
        calls.push({ method, path: p, body, auth: opts.headers && opts.headers.Authorization });

        if (network.respond) {
            const override = network.respond({ method, path: p, body });
            if (override) return override;
        }

        let m;
        if (method === 'POST' && p === '/api/prospects') {
            // Mirrors db.createProspect's client_ref idempotency.
            const existing = body.client_ref && [...prospects.values()].find(x => x.client_ref === body.client_ref);
            if (existing) return json(201, existing);
            const created = { id: randomUUID(), stage: 'nouveau', is_archived: 0, ...body };
            prospects.set(created.id, created);
            if (network.loseNextResponse) {
                // The server did the work, but the reply never reaches the phone.
                network.loseNextResponse = false;
                throw new TypeError('Failed to fetch');
            }
            return json(201, created);
        }
        if (method === 'PATCH' && (m = p.match(/^\/api\/prospects\/([^/]+)$/))) {
            const existing = prospects.get(m[1]);
            if (!existing) return json(404, { error: 'Contact introuvable' });
            Object.assign(existing, body);
            return json(200, existing);
        }
        return json(404, { error: 'Introuvable' });
    }

    const sandbox = {
        console: { log() {}, error() {} },
        URL,
        TextEncoder,
        crypto: webcrypto,
        fetch,
        indexedDB: createFakeIndexedDB(),
        navigator: { onLine: true },
        setInterval: () => 0,
        API_BASE_URL: API
    };
    sandbox.window = sandbox;
    sandbox.window.Capacitor = { isNativePlatform: () => true };
    sandbox.window.addEventListener = () => {};
    sandbox.window.location = { origin: 'https://localhost' };

    vm.createContext(sandbox);
    vm.runInContext(`${OFFLINE_JS}\nthis.OfflineSync = OfflineSync;`, sandbox);

    return { OfflineSync: sandbox.OfflineSync, prospects, calls, network };
}

// request() also kicks off a background sync it doesn't await; let it
// finish before the test drives syncPendingChanges() itself.
const settle = () => new Promise(resolve => setTimeout(resolve, 20));

async function loggedIn(h, userId = 'user-1') {
    await h.OfflineSync.setUser({ id: userId, name: 'Rep' });
    await h.OfflineSync.setToken('token-1');
}

async function offlineWrite(h, urlPath, method, body) {
    const result = await h.OfflineSync.request(urlPath, { method, body: JSON.stringify(body) }, () => {});
    await settle();
    return result;
}

test('an edit queued behind an offline create still reaches the real contact when sync is interrupted in between', async () => {
    const h = createHarness();
    await loggedIn(h);

    h.network.down = true;
    const temp = await offlineWrite(h, '/api/prospects', 'POST', { name: 'Alice' });
    assert.match(temp.id, /^offline-/);
    await offlineWrite(h, `/api/prospects/${temp.id}`, 'PATCH', { city: 'Douala' });
    assert.equal(await h.OfflineSync.pendingCount(), 2);

    // Connectivity comes back just long enough for the create to go through,
    // then drops before the edit is sent.
    h.network.down = false;
    h.network.respond = ({ method }) => {
        if (method === 'PATCH') { h.network.down = true; throw new TypeError('Failed to fetch'); }
        return null;
    };
    await h.OfflineSync.syncPendingChanges();
    assert.equal(h.prospects.size, 1);
    assert.equal(await h.OfflineSync.pendingCount(), 1);

    // Next sync pass (fresh, nothing held in memory from the previous one).
    h.network.down = false;
    h.network.respond = null;
    await h.OfflineSync.syncPendingChanges();

    const [real] = [...h.prospects.values()];
    assert.equal(real.city, 'Douala');
    assert.ok(!h.calls.some(c => c.path.includes('offline-')), 'no request should target a temporary id');
    assert.equal(h.prospects.size, 1, 'the contact must not be created twice');
    assert.equal(await h.OfflineSync.pendingCount(), 0);
    assert.equal((await h.OfflineSync.failedChanges()).length, 0);
});

test('a 401 during sync keeps every queued change and resumes after a new login', async () => {
    const h = createHarness();
    await loggedIn(h);

    h.network.down = true;
    await offlineWrite(h, '/api/prospects', 'POST', { name: 'Bob' });
    await offlineWrite(h, '/api/prospects', 'POST', { name: 'Carla' });

    h.network.down = false;
    h.network.respond = () => new Response(JSON.stringify({ error: 'Ton abonnement a expire.' }), { status: 401 });
    await h.OfflineSync.syncPendingChanges();

    assert.equal(await h.OfflineSync.pendingCount(), 2, 'nothing may be dropped on a 401');
    assert.equal((await h.OfflineSync.failedChanges()).length, 0);
    assert.equal(h.OfflineSync.authBlocked, true);

    // While blocked, syncing doesn't keep hammering the server with a dead token.
    const callsBefore = h.calls.length;
    await h.OfflineSync.syncPendingChanges();
    assert.equal(h.calls.length, callsBefore);

    // A real login hands over a fresh token: the queue goes through.
    h.network.respond = null;
    await h.OfflineSync.setToken('token-2');
    await h.OfflineSync.syncPendingChanges();
    assert.equal(h.OfflineSync.authBlocked, false);
    assert.equal(await h.OfflineSync.pendingCount(), 0);
    assert.deepEqual([...h.prospects.values()].map(p => p.name).sort(), ['Bob', 'Carla']);
});

test('server errors (5xx) are retried later, genuine rejections are dropped but reported', async () => {
    const h = createHarness();
    await loggedIn(h);

    h.network.down = true;
    await offlineWrite(h, '/api/prospects/9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d', 'PATCH', { name: 'Deleted elsewhere' });

    h.network.down = false;
    h.network.respond = () => new Response(JSON.stringify({ error: 'Erreur interne' }), { status: 503 });
    await h.OfflineSync.syncPendingChanges();
    assert.equal(await h.OfflineSync.pendingCount(), 1, 'a 5xx must not drop the change');
    assert.equal((await h.OfflineSync.failedChanges()).length, 0);

    // The contact really is gone server-side: 404, can't ever succeed.
    h.network.respond = null;
    await h.OfflineSync.syncPendingChanges();
    assert.equal(await h.OfflineSync.pendingCount(), 0);
    const failures = await h.OfflineSync.failedChanges();
    assert.equal(failures.length, 1);
    assert.equal(failures[0].kind, 'update');
    assert.equal(failures[0].error, 'Contact introuvable');

    await h.OfflineSync.clearFailedChanges();
    assert.equal((await h.OfflineSync.failedChanges()).length, 0);
});

test("another account logging in on the device never gets the previous account's changes", async () => {
    const h = createHarness();
    await loggedIn(h, 'user-1');

    h.network.down = true;
    await offlineWrite(h, '/api/prospects', 'POST', { name: 'Private contact' });

    // user-1 logs out, user-2 logs in on the same phone.
    await h.OfflineSync.clearSession();
    h.network.down = false;
    await loggedIn(h, 'user-2');
    await h.OfflineSync.syncPendingChanges();

    assert.equal(h.prospects.size, 0);
    assert.equal(await h.OfflineSync.pendingCount(), 1, "user-1's change stays queued for user-1");

    await loggedIn(h, 'user-1');
    await h.OfflineSync.syncPendingChanges();
    assert.equal(h.prospects.size, 1);
    assert.equal(await h.OfflineSync.pendingCount(), 0);
});

test('a create whose response was lost is not duplicated when the sync retries it', async () => {
    const h = createHarness();
    await loggedIn(h);

    h.network.down = true;
    const temp = await offlineWrite(h, '/api/prospects', 'POST', { name: 'Reseau instable' });

    h.network.down = false;
    h.network.loseNextResponse = true;
    await h.OfflineSync.syncPendingChanges();
    assert.equal(h.prospects.size, 1, 'the server created it…');
    assert.equal(await h.OfflineSync.pendingCount(), 1, '…but the phone did not get the answer, so it is still queued');

    await h.OfflineSync.syncPendingChanges();
    assert.equal(h.prospects.size, 1, 'the retry must not create a second contact');
    assert.equal(await h.OfflineSync.pendingCount(), 0);
    const posts = h.calls.filter(c => c.method === 'POST');
    assert.deepEqual(posts.map(c => c.body.client_ref), [temp.id, temp.id]);
});

test('changes refused during the subscription grace period stay queued and go through once renewed', async () => {
    const h = createHarness();
    await loggedIn(h);

    h.network.down = true;
    await offlineWrite(h, '/api/prospects', 'POST', { name: 'Pendant la grace' });

    h.network.down = false;
    h.network.respond = () => new Response(JSON.stringify({ error: 'lecture seule', code: 'subscription_grace' }), { status: 403 });
    await h.OfflineSync.syncPendingChanges();
    assert.equal(await h.OfflineSync.pendingCount(), 1, 'kept, not dropped');
    assert.equal((await h.OfflineSync.failedChanges()).length, 0);
    assert.equal(h.OfflineSync.authBlocked, false, 'no re-login needed, just a renewal');

    h.network.respond = null; // admin renewed the subscription
    await h.OfflineSync.syncPendingChanges();
    assert.equal(await h.OfflineSync.pendingCount(), 0);
    assert.equal(h.prospects.size, 1);
});
