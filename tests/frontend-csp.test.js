// The CSP set in server.js (script-src 'self', no 'unsafe-inline') makes the
// browser silently ignore inline event-handler attributes such as
// onclick="...". Nothing errors visibly — the handler just never runs — so
// guard against reintroducing them in the frontend sources.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const INLINE_HANDLER = /<[^>]*\son[a-z]+\s*=/i;

test('frontend sources contain no inline on*= event handlers (blocked by the CSP)', () => {
    const files = fs.readdirSync(PUBLIC_DIR).filter(f => /\.(html|js)$/.test(f));
    assert.ok(files.length > 0);
    for (const file of files) {
        const lines = fs.readFileSync(path.join(PUBLIC_DIR, file), 'utf8').split('\n');
        lines.forEach((line, i) => {
            assert.ok(!INLINE_HANDLER.test(line), `${file}:${i + 1} has an inline event handler: ${line.trim()}`);
        });
    }
});
