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

// A cleared date must be stored as NULL, never '': SQL compares '' as
// earlier than any date, so `next_followup_at <= now` counted every
// cleared follow-up as overdue (phantom reminders in the bell).
function isoDate(value, field, opts = {}) {
    const v = str(value, field, { ...opts, maxLength: 40 });
    if (v === undefined) return undefined;
    if (!v) return null;
    if (Number.isNaN(Date.parse(v))) {
        throw new ValidationError(`${field} n'est pas une date valide`);
    }
    return v;
}

// Same undefined / null-clears convention as the others. Accepts numeric
// strings too, since HTML number inputs often end up sent as text.
function number(value, field, { min = -Infinity, max = Infinity, integer = false } = {}) {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    const n = typeof value === 'string' ? Number(value.trim()) : value;
    if (typeof n !== 'number' || !Number.isFinite(n) || (integer && !Number.isInteger(n))) {
        throw new ValidationError(`${field} doit etre un nombre${integer ? ' entier' : ''}`);
    }
    if (n < min || n > max) throw new ValidationError(`${field} doit etre entre ${min} et ${max}`);
    return n;
}

// A calendar date with no time: 'YYYY-MM-DD', and a real one (no 02-30).
function dateOnly(value, field) {
    const v = str(value, field, { maxLength: 10 });
    if (v === undefined) return undefined;
    if (!v) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    const d = m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    if (!d || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) {
        throw new ValidationError(`${field} doit etre une date au format AAAA-MM-JJ`);
    }
    return v;
}

module.exports = { str, phone, url, oneOf, isoDate, number, dateOnly };
