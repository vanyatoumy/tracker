// Static checks on the frontend sources.
//
// 1. The CSP set in server.js (script-src 'self', no 'unsafe-inline') makes
//    the browser silently ignore inline event-handler attributes such as
//    onclick="...". Nothing errors visibly — the handler just never runs —
//    so guard against reintroducing them.
// 2. The frontend is split into plain scripts under public/js/ that share
//    one global scope and load in index.html's order; a file missing from
//    index.html (or init.js not last) breaks the app with no build step to
//    catch it.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const JS_DIR = path.join(PUBLIC_DIR, 'js');
const INLINE_HANDLER = /<[^>]*\son[a-z]+\s*=/i;

function frontendFiles() {
    const top = fs.readdirSync(PUBLIC_DIR).filter(f => /\.(html|js)$/.test(f)).map(f => path.join(PUBLIC_DIR, f));
    const js = fs.readdirSync(JS_DIR).filter(f => f.endsWith('.js')).map(f => path.join(JS_DIR, f));
    return [...top, ...js];
}

test('frontend sources contain no inline on*= event handlers (blocked by the CSP)', () => {
    const files = frontendFiles();
    assert.ok(files.length > 10);
    for (const file of files) {
        const lines = fs.readFileSync(file, 'utf8').split('\n');
        lines.forEach((line, i) => {
            assert.ok(!INLINE_HANDLER.test(line), `${path.relative(PUBLIC_DIR, file)}:${i + 1} has an inline event handler: ${line.trim()}`);
        });
    }
});

test('index.html loads every public/js file, with init.js last', () => {
    const html = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
    const loaded = [...html.matchAll(/<script src="js\/([^"]+)"><\/script>/g)].map(m => m[1]);
    const onDisk = fs.readdirSync(JS_DIR).filter(f => f.endsWith('.js')).sort();
    assert.deepEqual([...loaded].sort(), onDisk, 'every file in public/js/ must be listed in index.html (and nothing else)');
    assert.equal(loaded[loaded.length - 1], 'init.js', 'init.js starts the app and must load last');
    assert.equal(loaded[0], 'core.js', 'core.js defines the shared state and helpers and must load first');
});
