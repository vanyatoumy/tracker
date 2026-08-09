# TLS / domain setup (suivipro.info)

Run these on the VPS (54.38.242.120) once DNS has propagated. Requires root
(sudo) — hand this file to whoever administers the server.

**Note**: this VPS already runs nginx on port 443 for another site, so we
use nginx + certbot for suivipro.info instead of Caddy (a Caddyfile is
still in this folder in case that ever changes, but it's not the active
path — see "Why not Caddy" at the bottom).

## 1. DNS

At your registrar, create an A record:

```
suivipro.info.   A   54.38.242.120
```

Wait for it to resolve before continuing:

```bash
dig +short suivipro.info
```

## 2. Add the nginx site config

```bash
sudo cp deploy/nginx-suivipro.conf /etc/nginx/sites-available/suivipro.info
sudo ln -s /etc/nginx/sites-available/suivipro.info /etc/nginx/sites-enabled/
sudo nginx -t          # sanity-check the config before reloading
sudo systemctl reload nginx
```

At this point `http://suivipro.info` should already reverse-proxy to the
Node app on port 3000 (no TLS yet — that's next).

## 3. Get a certificate with certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d suivipro.info
```

certbot's nginx plugin edits `/etc/nginx/sites-available/suivipro.info`
in place: adds the `listen 443 ssl` block with the issued certificate, and
an HTTP → HTTPS redirect. It also sets up auto-renewal (a systemd timer,
`certbot.timer` — check with `systemctl list-timers | grep certbot`).

## 4. Firewall

Only 80, 443, and SSH should be reachable from the internet; the app's own
port 3000 should stay internal-only:

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow OpenSSH
sudo ufw deny 3000/tcp
sudo ufw enable
```

## 5. App env vars

In the app's `.env` on the VPS:

```
NODE_ENV=production
TRUST_PROXY=true
```

(`COOKIE_SECURE` defaults to `true` when `NODE_ENV=production`, no need to
set it explicitly.) Restart the app service after changing `.env`.

## 6. Verify

```bash
curl -I https://suivipro.info
```

Expect `HTTP/2 200` with no certificate warnings.

## 7. Rebuild the Android app

The mobile app's API base URL is baked into the bundle
(`public/env.js`, already updated to `https://suivipro.info`) and the
Capacitor scheme was reverted from `http`/`cleartext` back to the default
`https`. After pulling these changes:

```bash
npx cap sync android
```

then rebuild in Android Studio.

---

### Why not Caddy

The original plan was Caddy, which handles TLS automatically with less
config. That assumed port 443 was free. This VPS's nginx already holds
443 for another site, and nginx can't share a port with another server
listening directly on it (unlike hosting multiple *domains* on nginx
itself, which nginx does natively via server blocks/SNI — that's exactly
what step 2 above relies on). Two options existed once that was known:

1. **Add suivipro.info as another nginx server block** (what we did) —
   minimal disruption, reuses the nginx + certbot stack already on the box.
2. Run Caddy on an alternate port and have nginx proxy *to* Caddy for this
   one domain — more moving parts for no real benefit here.

Option 1 was simpler and is what `deploy/nginx-suivipro.conf` implements.
`deploy/Caddyfile` is left in place only in case this VPS's nginx usage
ever changes and Caddy becomes viable again.
