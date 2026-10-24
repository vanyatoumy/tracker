// ============================================
// OFFLINE SYNC (mobile app only)
// ============================================
// Field reps often work with no signal. This module lets the app keep
// working when offline: reads fall back to a local IndexedDB mirror of the
// prospect list, and writes made offline are queued and replayed against the
// real API once connectivity returns.
//
// Scope, deliberately: this covers the day-to-day pipeline workflow (view,
// create, edit, change stage, archive, delete, log an interaction). It does
// NOT cover bulk/Google import, stats, or admin screens — those need the
// server's own logic (phone parsing, aggregate queries) and aren't part of
// what a rep does standing in front of a prospect with no signal. Those
// calls fall straight through to a normal fetch and fail normally if
// there's no connection, same as before this module existed.
//
// Conflict handling is last-write-wins: whichever write reaches the server
// last overwrites the row's editable fields. That's a real limitation for
// two people editing the same contact while both offline, but this app is
// used by a small team, not a crowd — full merge/conflict UI is out of
// scope for what that risk actually costs.
//
// Loaded as a plain <script> before app.js (no bundler in this project), so
// it's a global `OfflineSync` object rather than an ES module export.

const OfflineSync = (() => {
  const DB_NAME = 'suivi-prospection-offline';
  const DB_VERSION = 1;
  const TEMP_ID_PREFIX = 'offline-';
  const ID_MAP_PREFIX = 'idmap:'; // meta key prefix: tempId -> server id, see syncPendingChanges

  const enabled = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

  let dbPromise = null;
  let syncing = false;
  let isOnline = navigator.onLine !== false;
  // Set when a sync attempt got a 401: retrying with the same token is
  // pointless, so syncing waits until a real login provides a new one.
  let authBlocked = false;

  // Without this, Android/Chrome can treat this origin's IndexedDB data as
  // evictable under storage pressure or after the app's gone unused for a
  // while — surfacing as "the offline cache just vanished" after the app
  // was closed for a long time. Requesting persistence tells the OS this
  // data shouldn't be cleared automatically. Best-effort: if the API isn't
  // available or the request is refused, everything still works, it's just
  // subject to eviction again like before.
  async function requestPersistentStorage() {
    if (!enabled || !navigator.storage || !navigator.storage.persist) return;
    try {
      const already = await navigator.storage.persisted();
      const granted = already || await navigator.storage.persist();
      console.log(`Persistent storage ${granted ? 'granted' : 'NOT granted'} (already: ${already})`);
    } catch (err) {
      console.error('Persistent storage request failed:', err);
    }
  }

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('prospects')) db.createObjectStore('prospects', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('interactions')) db.createObjectStore('interactions', { keyPath: 'prospect_id' });
        if (!db.objectStoreNames.contains('history')) db.createObjectStore('history', { keyPath: 'prospect_id' });
        if (!db.objectStoreNames.contains('queue')) db.createObjectStore('queue', { keyPath: 'queueId', autoIncrement: true });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('authCache')) db.createObjectStore('authCache', { keyPath: 'phone' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function tx(storeName, mode) {
    return openDb().then(db => db.transaction(storeName, mode).objectStore(storeName));
  }

  function reqToPromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function getAll(storeName) {
    const store = await tx(storeName, 'readonly');
    return reqToPromise(store.getAll());
  }
  async function getOne(storeName, key) {
    const store = await tx(storeName, 'readonly');
    return reqToPromise(store.get(key));
  }
  async function put(storeName, value) {
    const store = await tx(storeName, 'readwrite');
    return reqToPromise(store.put(value));
  }
  async function del(storeName, key) {
    const store = await tx(storeName, 'readwrite');
    return reqToPromise(store.delete(key));
  }

  // ---------- request URL / auth token ----------

  // The bundled app's own origin (see capacitor.config.json — no more
  // server.url) is unrelated to the API server, so every relative path
  // needs the real server prefixed on. env.js defines this, loaded before
  // this file.
  function resolveUrl(path) {
    return /^https?:\/\//.test(path) ? path : API_BASE_URL + path;
  }

  // Cross-origin means the session cookie can't be used (see server.js's
  // CORS comment) — this token is the same session value, just sent as a
  // header instead. Kept in memory for every request and mirrored to
  // IndexedDB so it survives an app restart.
  let authToken = null;
  async function loadTokenFromDb() {
    const row = await getOne('meta', 'authToken');
    authToken = row ? row.value : null;
  }
  // request() awaits this before doing anything — without it, the very
  // first call (e.g. the /api/auth/me boot check) could race ahead of the
  // IndexedDB read above and go out with no token, reading as an expired
  // session and wrongly bouncing to the login screen despite a perfectly
  // valid cached one.
  const readyPromise = enabled ? loadTokenFromDb() : Promise.resolve();
  async function setToken(token) {
    if (!enabled) return;
    authToken = token;
    if (token) authBlocked = false;
    if (token) await put('meta', { key: 'authToken', value: token });
    else await del('meta', 'authToken');
  }
  function authHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) headers.Authorization = `Bearer ${authToken}`;
    return headers;
  }

  // ---------- meta / user cache ----------

  async function setUser(user) {
    if (!enabled || !user) return;
    await put('meta', { key: 'currentUser', value: user });
  }
  async function getCachedUser() {
    const row = await getOne('meta', 'currentUser');
    return row ? row.value : null;
  }
  // Session + token cache — cleared on logout (the token is also actively
  // invalidated server-side by the logout call itself, so keeping it around
  // would just be a dead value). Deliberately doesn't touch the authCache
  // password verifier below, so the same person can still log back in
  // offline after signing out — that just won't be able to sync anything
  // until a real online login gets a fresh token.
  async function clearSession() {
    if (!enabled) return;
    await del('meta', 'currentUser');
    await setToken(null);
  }

  // ---------- offline login (password verifier) ----------
  //
  // The server never sends the actual password hash to the client (nor
  // should it), so offline login can't check against the real credential.
  // Instead, every time a login succeeds for real (checked by the server,
  // which also confirms the account is active), we derive a SEPARATE,
  // local-only verifier from the password the user just typed and cache it
  // here. A later offline login attempt is checked against that cached
  // verifier instead of the server. This is why offline login only ever
  // works for an account that has (a) been activated — a login can't
  // succeed server-side otherwise, so nothing gets cached — and (b) been
  // logged into on this specific device at least once with the password
  // being entered, since the cache is overwritten on every successful login.
  //
  // PBKDF2-HMAC-SHA256, hand-rolled rather than via SubtleCrypto.deriveBits:
  // SubtleCrypto is only available in a "secure context" (HTTPS, or
  // localhost) — this app is currently served over plain HTTP from a LAN IP
  // (and the VPS has no TLS yet either), so crypto.subtle is undefined here
  // and would stay that way in production too until TLS exists. This never
  // needs to match the server's own algorithm (scrypt) since it's a
  // self-contained local-only check.
  function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
  const SHA256_K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ]);
  function sha256(bytes) {
    const l = bytes.length;
    const padded = new Uint8Array((Math.ceil((l + 9) / 64)) * 64);
    padded.set(bytes);
    padded[l] = 0x80;
    const dv = new DataView(padded.buffer);
    dv.setUint32(padded.length - 4, l * 8, false);

    let [h0, h1, h2, h3, h4, h5, h6, h7] = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const w = new Uint32Array(64);
    for (let offset = 0; offset < padded.length; offset += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(offset + i * 4, false);
      for (let i = 16; i < 64; i++) {
        const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      let [a, b, c, d, e, f, g, h] = [h0, h1, h2, h3, h4, h5, h6, h7];
      for (let i = 0; i < 64; i++) {
        const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + SHA256_K[i] + w[i]) | 0;
        const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
      h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
    }
    const out = new Uint8Array(32);
    const outDv = new DataView(out.buffer);
    [h0, h1, h2, h3, h4, h5, h6, h7].forEach((v, i) => outDv.setUint32(i * 4, v, false));
    return out;
  }
  function concatBytes(...arrs) {
    const out = new Uint8Array(arrs.reduce((s, a) => s + a.length, 0));
    let o = 0;
    for (const a of arrs) { out.set(a, o); o += a.length; }
    return out;
  }
  function hmacSha256(keyBytes, msgBytes) {
    const blockSize = 64;
    const key = keyBytes.length > blockSize ? sha256(keyBytes) : keyBytes;
    const padded = new Uint8Array(blockSize);
    padded.set(key);
    const ipad = new Uint8Array(blockSize), opad = new Uint8Array(blockSize);
    for (let i = 0; i < blockSize; i++) { ipad[i] = padded[i] ^ 0x36; opad[i] = padded[i] ^ 0x5c; }
    return sha256(concatBytes(opad, sha256(concatBytes(ipad, msgBytes))));
  }
  // Iteration count is far lower than a native KDF (e.g. the server's
  // scrypt) would use — this runs unaccelerated in JS on a phone, so it has
  // to stay fast enough to not stall the login button. It's checked against
  // a value that never leaves the device, so the threat model is "someone
  // with the phone in hand guessing" rather than a remote brute-force
  // oracle, which this is adequate for.
  const PBKDF2_ITERATIONS = 2000;
  function pbkdf2(passwordBytes, saltBytes) {
    let u = hmacSha256(passwordBytes, concatBytes(saltBytes, new Uint8Array([0, 0, 0, 1])));
    let t = u;
    for (let i = 1; i < PBKDF2_ITERATIONS; i++) {
      u = hmacSha256(passwordBytes, u);
      for (let j = 0; j < t.length; j++) t[j] ^= u[j];
    }
    return t;
  }
  function bytesToHex(bytes) {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  function deriveVerifier(password, saltBytes) {
    return bytesToHex(pbkdf2(new TextEncoder().encode(password), saltBytes));
  }

  async function cacheLoginCredential(phone, password, user) {
    if (!enabled) return;
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const verifier = await deriveVerifier(password, salt);
    await put('authCache', { phone, salt: bytesToHex(salt), verifier, user, cachedAt: nowIso() });
  }

  async function verifyOfflineLogin(phone, password) {
    const row = await getOne('authCache', phone);
    if (!row) return null;
    const saltBytes = new Uint8Array(row.salt.match(/../g).map(h => parseInt(h, 16)));
    const attempt = await deriveVerifier(password, saltBytes);
    // Not constant-time, but there's no remote oracle here to time-attack —
    // this check never leaves the device.
    return attempt === row.verifier ? row.user : null;
  }

  // ---------- prospect cache ----------

  async function cacheProspect(prospect) {
    await put('prospects', prospect);
  }
  async function removeCachedProspect(id) {
    await del('prospects', id);
  }

  function applyFilters(list, filters) {
    let out = list;
    if (filters.archived !== '1') out = out.filter(p => !p.is_archived);
    if (filters.stage) out = out.filter(p => p.stage === filters.stage);
    if (filters.source) out = out.filter(p => p.source === filters.source);
    if (filters.interest_type) out = out.filter(p => p.interest_type === filters.interest_type);
    if (filters.temperature) out = out.filter(p => p.temperature === filters.temperature);
    if (filters.country) out = out.filter(p => p.country === filters.country);
    if (filters.city) out = out.filter(p => (p.city || '').toLowerCase().includes(filters.city.toLowerCase()));
    if (filters.quarter) out = out.filter(p => (p.quarter || '').toLowerCase().includes(filters.quarter.toLowerCase()));
    if (filters.search) {
      const s = filters.search.toLowerCase();
      out = out.filter(p => (p.name || '').toLowerCase().includes(s) || (p.phone || '').includes(filters.search));
    }
    return out.sort((a, b) => (b.stage_updated_at || '').localeCompare(a.stage_updated_at || ''));
  }

  // On a successful unfiltered fetch, the server's list is the full truth for
  // every ordinary (non-temp) id — anything cached locally under a real id
  // but missing from that response was deleted server-side and should be
  // dropped too. Temp-id rows (not yet synced) and filtered fetches never
  // trigger this pruning, since neither represents "everything that exists".
  async function replaceProspectCache(serverList, filters) {
    const isFullUnfiltered = !filters.archived && !filters.stage && !filters.source &&
      !filters.interest_type && !filters.temperature && !filters.country && !filters.city && !filters.quarter && !filters.search;

    const store = await tx('prospects', 'readwrite');
    const existing = await reqToPromise(store.getAll());
    const dirtyIds = new Set(existing.filter(p => p._dirty).map(p => p.id));

    for (const p of serverList) {
      if (!dirtyIds.has(p.id)) store.put(p);
    }
    if (isFullUnfiltered) {
      const serverIds = new Set(serverList.map(p => p.id));
      for (const p of existing) {
        if (!p.id.startsWith(TEMP_ID_PREFIX) && !serverIds.has(p.id) && !dirtyIds.has(p.id)) {
          store.delete(p.id);
        }
      }
    }
  }

  // ---------- queue ----------

  // Each entry records which account made it, so a different account
  // logging in on the same device never gets someone else's pending changes
  // replayed into it (see syncPendingChanges).
  async function enqueue(entry) {
    const user = await getCachedUser();
    const store = await tx('queue', 'readwrite');
    return reqToPromise(store.add({ ...entry, userId: user ? user.id : null, createdAt: new Date().toISOString() }));
  }
  async function queueLength() {
    const store = await tx('queue', 'readonly');
    return reqToPromise(store.count());
  }

  // ---------- offline write handling ----------

  function nowIso() { return new Date().toISOString(); }

  // crypto.randomUUID() is secure-context-only, same restriction that bit
  // crypto.subtle above — build a v4 UUID from crypto.getRandomValues()
  // instead, which has no such restriction.
  function randomUuid() {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytesToHex(bytes);
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  async function offlineCreate(payload) {
    const user = await getCachedUser();
    const id = TEMP_ID_PREFIX + randomUuid();
    const ts = nowIso();
    const prospect = {
      id,
      owner_id: user ? user.id : null,
      name: payload.name,
      phone: payload.phone || null,
      alt_phone: payload.alt_phone || null,
      country: payload.country || null,
      city: payload.city || null,
      quarter: payload.quarter || null,
      facebook_profile_url: payload.facebook_profile_url || null,
      stage: 'nouveau',
      stage_updated_at: ts,
      source: payload.source || null,
      interest_type: payload.interest_type || null,
      is_archived: 0,
      next_followup_at: payload.next_followup_at || null,
      created_at: ts,
      updated_at: ts,
      _dirty: true
    };
    await cacheProspect(prospect);
    await enqueue({ kind: 'create', tempId: id, realId: null, payload });
    return prospect;
  }

  async function offlineUpdate(id, payload) {
    const existing = (await getOne('prospects', id)) || { id };
    const merged = { ...existing, ...payload, updated_at: nowIso(), _dirty: true };
    await cacheProspect(merged);
    await enqueue({ kind: 'update', tempId: id.startsWith(TEMP_ID_PREFIX) ? id : null, realId: id.startsWith(TEMP_ID_PREFIX) ? null : id, payload });
    return merged;
  }

  async function offlineStage(id, to_stage, note) {
    const existing = (await getOne('prospects', id)) || { id };
    const merged = { ...existing, stage: to_stage, stage_updated_at: nowIso(), _dirty: true };
    await cacheProspect(merged);
    await enqueue({ kind: 'stage', tempId: id.startsWith(TEMP_ID_PREFIX) ? id : null, realId: id.startsWith(TEMP_ID_PREFIX) ? null : id, payload: { to_stage, note } });
    return merged;
  }

  async function offlineArchive(id, archived) {
    const existing = (await getOne('prospects', id)) || { id };
    const merged = { ...existing, is_archived: archived ? 1 : 0, _dirty: true };
    await cacheProspect(merged);
    await enqueue({ kind: 'archive', tempId: id.startsWith(TEMP_ID_PREFIX) ? id : null, realId: id.startsWith(TEMP_ID_PREFIX) ? null : id, payload: { archived } });
    return merged;
  }

  async function offlineDelete(id) {
    await removeCachedProspect(id);
    if (!id.startsWith(TEMP_ID_PREFIX)) {
      await enqueue({ kind: 'delete', tempId: null, realId: id, payload: {} });
    }
    // A temp (never-synced) id has nothing on the server to delete — just
    // drop it locally, no queue entry needed.
  }

  async function offlineAddInteraction(id, payload) {
    const row = (await getOne('interactions', id)) || { prospect_id: id, items: [] };
    const item = { id: TEMP_ID_PREFIX + randomUuid(), prospect_id: id, type: payload.type, content: payload.content, created_at: nowIso() };
    row.items = [item, ...row.items];
    await put('interactions', row);
    await enqueue({ kind: 'interaction', tempId: id.startsWith(TEMP_ID_PREFIX) ? id : null, realId: id.startsWith(TEMP_ID_PREFIX) ? null : id, payload });
    return item;
  }

  // ---------- sync engine ----------

  async function syncPendingChanges() {
    if (!enabled || syncing || authBlocked) return;
    await readyPromise;
    syncing = true;
    try {
      const store = await tx('queue', 'readonly');
      let entries = await reqToPromise(store.getAll());
      entries.sort((a, b) => a.queueId - b.queueId);

      const me = await getCachedUser();

      for (const entry of entries) {
        // Another account's change (logged out, someone else logged in):
        // leave it queued for when its owner is back.
        if (entry.userId && (!me || me.id !== entry.userId)) continue;

        // The tempId -> real id mapping is persisted (not just held for this
        // pass): if a pass stops right after a create went through, the
        // edits queued behind it must still find the real id next time,
        // instead of being sent to /api/prospects/offline-... and dropped.
        const mappedId = entry.tempId ? await getMappedId(entry.tempId) : null;
        if (entry.kind === 'create' && mappedId) {
          // Created in an earlier pass that was cut off before this entry
          // was removed — don't create the contact a second time.
          await del('queue', entry.queueId);
          continue;
        }
        const resolvedId = entry.realId || mappedId || entry.tempId;
        try {
          const realId = await replayEntry(entry, resolvedId);
          if (entry.kind === 'create') await setMappedId(entry.tempId, realId);
          await del('queue', entry.queueId);
        } catch (err) {
          if (err && err.status === 401) {
            // Session expired / account deactivated / subscription lapsed.
            // The changes are fine, only the credentials aren't — keep the
            // whole queue and wait for a real login (setToken) to resume.
            authBlocked = true;
            break;
          }
          if (isRetryable(err)) {
            // Still offline, connection dropped mid-sync, or the server is
            // temporarily unavailable — stop here, leave this and every
            // later entry queued for next attempt.
            break;
          }
          // A genuine server rejection (bad payload, contact already
          // deleted server-side, etc.) can't be retried as-is. Drop it so
          // it doesn't block everything behind it, but keep a record the
          // app shows to the user (see failedChanges).
          console.error('Dropping unsyncable offline change:', entry, err);
          await recordFailure(entry, err);
          await del('queue', entry.queueId);
        }
      }
    } finally {
      syncing = false;
    }
  }

  async function rawFetch(path, opts) {
    let res;
    try {
      res = await fetch(resolveUrl(path), { headers: authHeaders(), credentials: 'omit', ...opts });
    } catch (networkErr) {
      const err = new Error('Network failure');
      err.isNetworkFailure = true;
      throw err;
    }
    isOnline = true;
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const err = new Error(body.error || `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return res.status === 204 ? null : res.json();
  }

  function isRetryable(err) {
    if (!err) return false;
    if (err.isNetworkFailure) return true;
    return err.status === 408 || err.status === 429 || err.status >= 500;
  }

  async function getMappedId(tempId) {
    const row = await getOne('meta', ID_MAP_PREFIX + tempId);
    return row ? row.value : null;
  }
  async function setMappedId(tempId, realId) {
    await put('meta', { key: ID_MAP_PREFIX + tempId, value: realId });
  }

  const MAX_RECORDED_FAILURES = 50;
  async function recordFailure(entry, err) {
    const row = await getOne('meta', 'syncFailures');
    const list = row ? row.value : [];
    list.push({ kind: entry.kind, payload: entry.payload, error: err.message, at: nowIso() });
    await put('meta', { key: 'syncFailures', value: list.slice(-MAX_RECORDED_FAILURES) });
  }
  async function failedChanges() {
    if (!enabled) return [];
    const row = await getOne('meta', 'syncFailures');
    return row ? row.value : [];
  }
  async function clearFailedChanges() {
    if (!enabled) return;
    await del('meta', 'syncFailures');
  }

  async function replayEntry(entry, resolvedId) {
    switch (entry.kind) {
      case 'create': {
        // client_ref = the temp id: if this POST already went through but
        // its response was lost, the retry gets the same contact back
        // instead of creating a duplicate (see db.createProspect).
        const created = await rawFetch('/api/prospects', { method: 'POST', body: JSON.stringify({ ...entry.payload, client_ref: entry.tempId }) });
        await removeCachedProspect(entry.tempId);
        await cacheProspect(created);
        const cachedInteractions = await getOne('interactions', entry.tempId);
        if (cachedInteractions) { await del('interactions', entry.tempId); await put('interactions', { ...cachedInteractions, prospect_id: created.id }); }
        return created.id;
      }
      case 'update': {
        const updated = await rawFetch(`/api/prospects/${resolvedId}`, { method: 'PATCH', body: JSON.stringify(entry.payload) });
        await cacheProspect(updated);
        return resolvedId;
      }
      case 'stage': {
        const updated = await rawFetch(`/api/prospects/${resolvedId}/stage`, { method: 'POST', body: JSON.stringify(entry.payload) });
        await cacheProspect(updated);
        return resolvedId;
      }
      case 'archive': {
        const updated = await rawFetch(`/api/prospects/${resolvedId}/archive`, { method: 'POST', body: JSON.stringify(entry.payload) });
        await cacheProspect(updated);
        return resolvedId;
      }
      case 'delete': {
        await rawFetch(`/api/prospects/${resolvedId}`, { method: 'DELETE' });
        return resolvedId;
      }
      case 'interaction': {
        await rawFetch(`/api/prospects/${resolvedId}/interactions`, { method: 'POST', body: JSON.stringify(entry.payload) });
        return resolvedId;
      }
      default:
        return resolvedId;
    }
  }

  // ---------- route matching for the public request() entry point ----------

  const ROUTES = [
    { re: /^\/api\/auth\/me$/, method: 'GET', kind: 'me' },
    { re: /^\/api\/prospects(\?.*)?$/, method: 'GET', kind: 'list' },
    { re: /^\/api\/prospects$/, method: 'POST', kind: 'create' },
    { re: /^\/api\/prospects\/([^/]+)$/, method: 'GET', kind: 'get' },
    { re: /^\/api\/prospects\/([^/]+)$/, method: 'PATCH', kind: 'update' },
    { re: /^\/api\/prospects\/([^/]+)\/stage$/, method: 'POST', kind: 'stage' },
    { re: /^\/api\/prospects\/([^/]+)\/archive$/, method: 'POST', kind: 'archive' },
    { re: /^\/api\/prospects\/([^/]+)$/, method: 'DELETE', kind: 'delete' },
    { re: /^\/api\/prospects\/([^/]+)\/history$/, method: 'GET', kind: 'history' },
    { re: /^\/api\/prospects\/([^/]+)\/interactions$/, method: 'GET', kind: 'interactions' },
    { re: /^\/api\/prospects\/([^/]+)\/interactions$/, method: 'POST', kind: 'addInteraction' },
    { re: /^\/api\/reminders$/, method: 'GET', kind: 'reminders' },
    // Read-only offline (cached on each successful fetch): templates and
    // purchases can only be created/edited online, but viewing them — and
    // so sending a templated message — keeps working without signal.
    { re: /^\/api\/templates$/, method: 'GET', kind: 'templates' },
    { re: /^\/api\/prospects\/([^/]+)\/purchases$/, method: 'GET', kind: 'purchases' }
  ];

  function matchRoute(path, method) {
    const pathOnly = path.split('?')[0];
    for (const r of ROUTES) {
      if (r.method !== method) continue;
      const m = r.re.test(path) || r.re.test(pathOnly);
      if (!m) continue;
      const idMatch = pathOnly.match(/^\/api\/prospects\/([^/]+)/);
      return { kind: r.kind, id: idMatch ? idMatch[1] : null };
    }
    return null;
  }

  // Mirrors api()'s contract in app.js exactly: resolves to parsed JSON (or
  // null for 204), or throws an Error with a user-facing .message. showAuth
  // is app.js's showAuthScreen, passed in rather than referenced globally so
  // this module doesn't assume load order relative to app.js.
  async function request(path, opts, showAuth) {
    await readyPromise;
    const method = (opts.method || 'GET').toUpperCase();
    const isAuthAttempt = path === '/api/auth/login' || path === '/api/auth/register';

    // Whenever we get a chance to talk to the network, drain the queue first
    // so reads see the results of our own not-yet-synced writes reconciled
    // with the server, and so pending changes leave the device ASAP.
    if (!syncing) syncPendingChanges();

    let res;
    try {
      res = await fetch(resolveUrl(path), { headers: authHeaders(), credentials: 'omit', ...opts });
    } catch {
      // fetch() itself throwing (as opposed to resolving with a non-2xx
      // response) is the one reliable "no connectivity" signal — tagging it
      // here rather than sniffing the error type later, since the exact
      // error class thrown differs between browser fetch and Capacitor's
      // native HTTP bridge.
      isOnline = false;
      return offlineFallback(path, method, opts, isAuthAttempt);
    }

    isOnline = true;
    if (res.status === 401 && !isAuthAttempt) {
      // Same reason passthrough as app.js's api(): deactivated account or
      // lapsed subscription, not just an expired session.
      const body = await res.json().catch(() => ({}));
      showAuth();
      throw new Error(body.error || 'Session expiree, reconnecte-toi');
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Erreur inconnue' }));
      throw new Error(err.error || 'Erreur inconnue');
    }
    const data = res.status === 204 ? null : await res.json();

    const route = matchRoute(path, method);
    if (route) await onNetworkSuccess(route, path, data);
    return data;
  }

  async function onNetworkSuccess(route, path, data) {
    const url = new URL(path, window.location.origin);
    switch (route.kind) {
      case 'list': {
        const filters = Object.fromEntries(url.searchParams.entries());
        await replaceProspectCache(data, filters);
        break;
      }
      case 'get':
      case 'create':
      case 'update':
      case 'stage':
      case 'archive':
        if (data) await cacheProspect({ ...data, _dirty: false });
        break;
      case 'delete':
        await removeCachedProspect(route.id);
        break;
      case 'interactions':
        await put('interactions', { prospect_id: route.id, items: data });
        break;
      case 'history':
        await put('history', { prospect_id: route.id, items: data });
        break;
      case 'me':
        await setUser(data);
        break;
      case 'templates':
        await put('meta', { key: 'templates', value: data });
        break;
      case 'purchases':
        await put('meta', { key: `purchases:${route.id}`, value: data });
        break;
    }
  }

  async function offlineFallback(path, method, opts, isAuthAttempt) {
    if (path === '/api/auth/register') {
      throw new Error('Pas de connexion internet — impossible de creer un compte hors ligne.');
    }
    if (path === '/api/auth/login') {
      const body = opts.body ? JSON.parse(opts.body) : {};
      const user = await verifyOfflineLogin(body.phone, body.password);
      if (user) return user;
      throw new Error('Numero ou mot de passe incorrect');
    }
    if (isAuthAttempt) throw new Error('Pas de connexion internet.');

    const route = matchRoute(path, method);
    if (!route) throw new Error('Pas de connexion internet.');

    const url = new URL(path, window.location.origin);
    const body = opts.body ? JSON.parse(opts.body) : {};

    switch (route.kind) {
      case 'me': {
        const cached = await getCachedUser();
        if (cached) return cached;
        throw new Error('Pas de connexion internet.');
      }
      case 'list': {
        const filters = Object.fromEntries(url.searchParams.entries());
        const all = await getAll('prospects');
        return applyFilters(all, filters);
      }
      case 'get': {
        const p = await getOne('prospects', route.id);
        if (!p) throw new Error('Introuvable (hors ligne)');
        return p;
      }
      case 'create':
        return offlineCreate(body);
      case 'update':
        return offlineUpdate(route.id, body);
      case 'stage':
        return offlineStage(route.id, body.to_stage, body.note);
      case 'archive':
        return offlineArchive(route.id, body.archived !== false);
      case 'delete':
        await offlineDelete(route.id);
        return null;
      case 'interactions': {
        const row = await getOne('interactions', route.id);
        return row ? row.items : [];
      }
      case 'addInteraction':
        return offlineAddInteraction(route.id, body);
      case 'history': {
        const row = await getOne('history', route.id);
        return row ? row.items : [];
      }
      case 'templates': {
        const row = await getOne('meta', 'templates');
        return row ? row.value : [];
      }
      case 'purchases': {
        const row = await getOne('meta', `purchases:${route.id}`);
        if (row) return row.value;
        throw new Error('Achats indisponibles hors ligne pour ce contact.');
      }
      case 'reminders': {
        const all = await getAll('prospects');
        const nowTs = new Date();
        return all
          .filter(p => !p.is_archived && p.next_followup_at && new Date(p.next_followup_at) <= nowTs)
          .sort((a, b) => a.next_followup_at.localeCompare(b.next_followup_at));
      }
      default:
        throw new Error('Pas de connexion internet.');
    }
  }

  async function pendingCount() {
    if (!enabled) return 0;
    return queueLength();
  }

  if (enabled) {
    requestPersistentStorage();
    window.addEventListener('online', () => { isOnline = true; syncPendingChanges(); });
    window.addEventListener('offline', () => { isOnline = false; });
    // Belt-and-suspenders: navigator connectivity events aren't always
    // reliable inside a WebView, so also retry periodically.
    setInterval(() => syncPendingChanges(), 30000);
  }

  return {
    enabled,
    request,
    setUser,
    setToken,
    clearSession,
    cacheLoginCredential,
    pendingCount,
    failedChanges,
    clearFailedChanges,
    syncPendingChanges,
    get isOnline() { return isOnline; },
    get authBlocked() { return authBlocked; }
  };
})();
