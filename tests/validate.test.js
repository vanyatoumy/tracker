// Pure unit tests, no server/DB needed — validate.js has no side effects.
const test = require('node:test');
const assert = require('node:assert/strict');
const validate = require('../validate');

test('str: undefined means "not sent" and is left alone unless required', () => {
    assert.equal(validate.str(undefined, 'Nom'), undefined);
    assert.throws(() => validate.str(undefined, 'Nom', { required: true }), /requis/);
});

test('str: empty string / null is a valid "clear the field" value when not required', () => {
    assert.equal(validate.str('', 'Nom'), '');
    assert.equal(validate.str(null, 'Nom'), '');
});

test('str: empty string is rejected when required', () => {
    assert.throws(() => validate.str('', 'Nom', { required: true }), /requis/);
    assert.throws(() => validate.str('   ', 'Nom', { required: true }), /requis/);
});

test('str: trims whitespace and enforces maxLength', () => {
    assert.equal(validate.str('  Marie  ', 'Nom'), 'Marie');
    assert.throws(() => validate.str('a'.repeat(10), 'Nom', { maxLength: 5 }), /depasse/);
});

test('str: rejects non-string values', () => {
    assert.throws(() => validate.str(42, 'Nom'), /texte/);
});

test('phone: accepts E.164 format', () => {
    assert.equal(validate.phone('+237677123456', 'Numero'), '+237677123456');
});

test('phone: rejects missing "+" or non-numeric content', () => {
    assert.throws(() => validate.phone('237677123456', 'Numero'), /international/);
    assert.throws(() => validate.phone('+abc', 'Numero'), /international/);
});

test('phone: undefined/empty pass through untouched (not required by default)', () => {
    assert.equal(validate.phone(undefined, 'Numero'), undefined);
    assert.equal(validate.phone('', 'Numero'), '');
});

test('url: accepts http(s) URLs and rejects other schemes', () => {
    assert.equal(validate.url('https://facebook.com/x', 'Lien'), 'https://facebook.com/x');
    assert.throws(() => validate.url('javascript:alert(1)', 'Lien'), /http/);
    assert.throws(() => validate.url('not a url', 'Lien'), /valide/);
});

test('oneOf: enforces the allowed set, passes through undefined, treats "" as clear (null)', () => {
    const allowed = ['produit', 'opportunite', 'indecis'];
    assert.equal(validate.oneOf('produit', 'Type', allowed), 'produit');
    assert.throws(() => validate.oneOf('autre_chose', 'Type', allowed), /invalide/);
    assert.equal(validate.oneOf(undefined, 'Type', allowed), undefined);
    assert.equal(validate.oneOf('', 'Type', allowed), null);
    assert.equal(validate.oneOf(null, 'Type', allowed), null);
});

test('oneOf: required rejects a missing value', () => {
    assert.throws(() => validate.oneOf(undefined, 'Type', ['a', 'b'], { required: true }), /requis/);
});

test('isoDate: accepts parseable dates and rejects garbage', () => {
    assert.equal(validate.isoDate('2026-07-18T10:00:00.000Z', 'Date'), '2026-07-18T10:00:00.000Z');
    assert.throws(() => validate.isoDate('not-a-date', 'Date'), /valide/);
});
