# APK releases

This folder is served statically at `/downloads/` and holds the Android
APK(s) linked from the login/register screen
(`public/index.html` → `.auth-download-note`).

`.apk` files here are **gitignored** — they're deployed straight to the
VPS, not committed to git (a growing set of ~4MB binaries in git history
isn't worth it for something this simple to re-deploy).

## Releasing a new version

1. Build the APK locally (see [docs/technical.md](../../docs/technical.md)
   §7 — `npx cap sync android` then `./gradlew assembleDebug`).
2. Name it `suivipro-<version>.apk`, matching `versionName` in
   `android/app/build.gradle` (e.g. `suivipro-1.0.apk`).
3. Upload it to the VPS:
   ```bash
   scp android/app/build/outputs/apk/debug/app-debug.apk \
       user@54.38.242.120:/path/to/mlm-tracker/public/downloads/suivipro-<version>.apk
   ```
4. Update the `href` in `public/index.html`'s `.auth-download-note` to
   point at the new filename, commit that one-line change, and deploy the
   app as usual (`git pull` + restart on the VPS).

Older versions can be left in place (in case anyone needs to roll back) or
deleted manually on the VPS — nothing here is tracked or auto-pruned.
