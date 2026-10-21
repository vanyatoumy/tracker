// Shared test bootstrap. Each test *file* gets its own throwaway SQLite DB
// and an ephemeral-port HTTP server, because `node --test` runs each test
// file in its own process — so setting env vars here (before anything else
// requires db.js/config.js) is enough for isolation; nothing needs cleanup
// between test files beyond deleting the temp DB file.
//
// Deliberately dependency-free: uses Node's built-in test runner, fetch,
// and a hand-rolled cookie jar instead of supertest/jest/etc., matching the
// rest of the project's "no unnecessary deps" approach.

const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const crypto = require('node:crypto');

// Must happen before `require('../server')` (which pulls in config.js ->
// db.js) so the app under test never touches the real database, and so the
// auth rate limiter doesn't interfere with tests that make many login
// attempts on purpose (lockout tests).
const TEST_DB_PATH = path.join(__dirname, `.tmp-${crypto.randomUUID()}.db`);
process.env.DB_PATH = TEST_DB_PATH;
process.env.RATE_LIMIT_AUTH_MAX = '100000';
process.env.NODE_ENV = 'test';

const app = require('../server');

let server;
let baseUrl;

async function startServer() {
    server = http.createServer(app);
    await new Promise((resolve, reject) => {
        server.listen(0, '127.0.0.1', (err) => (err ? reject(err) : resolve()));
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    return baseUrl;
}

async function stopServer() {
    if (server) await new Promise((resolve) => server.close(resolve));
    // Best-effort cleanup: on Windows, SQLite can briefly hold the file
    // handle open past the last query (no explicit close() is exposed by
    // db.js), so an immediate unlink can race with the OS releasing the
    // lock. That's fine — each test file uses a unique random filename, so
    // a leftover file here is just a small amount of disk usage, not a
    // correctness problem for other test runs.
    for (const suffix of ['', '.backup', '-wal', '-shm']) {
        try {
            fs.rmSync(TEST_DB_PATH + suffix, { force: true });
        } catch {
            // ignore — see comment above
        }
    }
}

// Minimal cookie jar: tracks the session cookie across requests so tests
// can exercise login -> authenticated request -> logout without manually
// threading a Set-Cookie header through every call.
// extraHeaders: sent on every request — e.g. X-Forwarded-For to simulate
// distinct client IPs in a test file that enables TRUST_PROXY.
function makeClient(extraHeaders = {}) {
    let cookie = null;

    async function request(method, urlPath, body) {
        const headers = { 'Content-Type': 'application/json', ...extraHeaders };
        if (cookie) headers.Cookie = cookie;

        const res = await fetch(baseUrl + urlPath, {
            method,
            headers,
            body: body !== undefined ? JSON.stringify(body) : undefined
        });

        const setCookie = res.headers.get('set-cookie');
        if (setCookie) cookie = setCookie.split(';')[0];

        let json = null;
        const text = await res.text();
        if (text) {
            try { json = JSON.parse(text); } catch { /* non-JSON response, leave json null */ }
        }
        return { status: res.status, body: json };
    }

    return {
        get: (p) => request('GET', p),
        post: (p, body) => request('POST', p, body),
        patch: (p, body) => request('PATCH', p, body),
        delete: (p) => request('DELETE', p),
        clearCookie: () => { cookie = null; }
    };
}

module.exports = { startServer, stopServer, makeClient };
