# TLS / domain setup (suivipro.info)

Run these on the VPS (54.38.242.120) once DNS has propagated. Requires root
(sudo) — hand this file to whoever administers the server.

## 1. DNS

At your registrar, create an A record:

```
suivipro.info.   A   54.38.242.120
```

Wait for it to resolve before continuing:

```bash
dig +short suivipro.info
```

## 2. Install Caddy

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

## 3. Deploy the Caddyfile

```bash
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Caddy automatically requests and renews a Let's Encrypt certificate for
`suivipro.info` the first time it starts — no manual certbot step needed.

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
