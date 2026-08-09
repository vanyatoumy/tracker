// The mobile app is now bundled locally (see capacitor.config.json — no more
// server.url), so it no longer shares an origin with the API server, and
// relative fetch paths like "/api/prospects" would resolve against the
// bundled app's own origin instead of the real server. This is the one
// place that needs editing when switching between your local dev server and
// the VPS for testing — after changing it, run `npx cap sync android` AND
// rebuild in Android Studio (unlike capacitor.config.json's old server.url,
// this is baked into the bundle, so a reload alone won't pick it up).
//
// The web version doesn't use this at all — it's always same-origin there.
const API_BASE_URL = 'https://suivipro.info';
