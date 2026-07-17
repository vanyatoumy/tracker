// Server-side input validation. The frontend already does most of this, but
// the API must never trust the client — anyone can call it directly.
//
// Convention used throughout: `value === undefined` means "the client didn't
// send this field at all" (leave it alone on a PATCH). An explicit empty
// string / null means "clear this field", which is a legitimate request on
// PATCH endpoints and is passed through, not rejected.
const { ValidationError } = require('./errors');

function str(value, field, { required = false, maxLength = 500 } = {}) {
    if (value === undefined) {
        if (required) throw new ValidationError(`${field} est requis`);
        return undefined;
    }
    if (value === null) value = '';
    if (typeof value !== 'string') throw new ValidationError(`${field} doit etre du texte`);
    const trimmed = value.trim();
    if (required && !trimmed) throw new ValidationError(`${field} est requis`);
    if (trimmed.length > maxLength) throw new ValidationError(`${field} depasse ${maxLength} caracteres`);
    return trimmed;
}

function phone(value, field, opts = {}) {
    const v = str(value, field, { ...opts, maxLength: 20 });
    if (!v) return v; // undefined or '' (clear) — nothing more to check
    if (!/^\+[1-9]\d{6,14}$/.test(v)) {
        throw new ValidationError(`${field} doit etre au format international, ex: +237677123456`);
    }
    return v;
}

function url(value, field, opts = {}) {
    const v = str(value, field, { ...opts, maxLength: 500 });
    if (!v) return v;
    let parsed;
    try {
        parsed = new URL(v);
    } catch {
        throw new ValidationError(`${field} n'est pas une URL valide`);
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new ValidationError(`${field} doit commencer par http:// ou https://`);
    }
    return v;
}

function oneOf(value, field, allowed, { required = false } = {}) {
    if (value === undefined) {
        if (required) throw new ValidationError(`${field} est requis`);
        return undefined;
    }
    if (value === null || value === '') return null;
    if (!allowed.includes(value)) {
        throw new ValidationError(`${field} invalide (valeurs possibles : ${allowed.join(', ')})`);
    }
    return value;
}

function isoDate(value, field, opts = {}) {
    const v = str(value, field, { ...opts, maxLength: 40 });
    if (!v) return v;
    if (Number.isNaN(Date.parse(v))) {
        throw new ValidationError(`${field} n'est pas une date valide`);
    }
    return v;
}

module.exports = { str, phone, url, oneOf, isoDate };
