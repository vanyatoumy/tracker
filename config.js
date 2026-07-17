// Centralized runtime configuration, sourced from environment variables.
// Loads a local .env file if present (Node's built-in loader — no extra
// dependency needed). Safe to run without a .env file (e.g. in containers
// where env vars are injected directly by the platform).
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
    process.loadEnvFile(envPath);
}

function parseBool(value, fallback) {
    if (value === undefined || value === '') return fallback;
    return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function parseInt10(value, fallback) {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : fallback;
}

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production';

module.exports = {
    NODE_ENV,
    isProd,

    PORT: parseInt10(process.env.PORT, 3000),

    // Where the SQLite file lives. Override in production to point at a
    // persistent volume (see README "Deployer ailleurs qu'en local").
    DB_PATH: process.env.DB_PATH
        ? path.resolve(process.env.DB_PATH)
        : path.join(__dirname, 'data', 'tracker.db'),

    SESSION_DURATION_DAYS: parseInt10(process.env.SESSION_DURATION_DAYS, 30),

    // Whether the session cookie requires HTTPS. Defaults to true in
    // production, false otherwise. Override explicitly if TLS is terminated
    // upstream (reverse proxy / load balancer) in a way that confuses that
    // default.
    COOKIE_SECURE: parseBool(process.env.COOKIE_SECURE, isProd),

    // Set to true when running behind a reverse proxy / load balancer (most
    // production hosts) so Express reads the real client IP from
    // X-Forwarded-For instead of the proxy's own IP. Needed for rate
    // limiting and logging to be meaningful.
    TRUST_PROXY: parseBool(process.env.TRUST_PROXY, false),

    RATE_LIMIT_AUTH_MAX: parseInt10(process.env.RATE_LIMIT_AUTH_MAX, 20),
    RATE_LIMIT_AUTH_WINDOW_MIN: parseInt10(process.env.RATE_LIMIT_AUTH_WINDOW_MIN, 15)
};
