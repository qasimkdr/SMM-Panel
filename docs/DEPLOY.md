# Go-live guide (free tier)

This takes the panel from GitHub to a live site at `https://yourdomain.com` with the admin panel at
`https://admin.yourdomain.com`, using free plans everywhere. The only cost is the domain (about $10/year).

Plan on **2–3 hours** the first time. Follow the steps in order.

---

## 1. What it costs

| Piece | Service | Plan | Cost | Limit that matters |
|---|---|---|---|---|
| Domain | Cloudflare Registrar (or any registrar) | — | **~$10/year** (.com) | The only paid item |
| DNS, SSL, CDN, DDoS, firewall | Cloudflare | Free | $0 | Unlimited bandwidth |
| Connect server to the internet | Cloudflare Tunnel (Zero Trust) | Free | $0 | Up to 50 team users (you only need 1) |
| Server | Oracle Cloud **Always Free** (Ampere A1, 4 CPU / 24 GB RAM, 200 GB disk) | Always Free | $0 | Card needed to sign up (not charged); idle VMs can be reclaimed (see §5.6) |
| Emails | Resend | Free | $0 | **3,000/month and 100/day** |
| Backups (off-site) | Oracle Object Storage (or Cloudflare R2) | Always Free | $0 | 20 GB (R2: 10 GB) |
| Uptime alerts | UptimeRobot | Free | $0 | 50 monitors, checks every 5 min |
| Exchange rates | open.er-api.com | Free, no key | $0 | Updated daily |
| Google sign-in (optional) | Google Cloud | Free | $0 | — |

**When free stops being enough:**
- More than ~100 emails a day: upgrade Resend (from $20/month) or switch to Brevo (300/day free).
- Oracle capacity problems or reclaimed VM: move to Hetzner CX22 (~€4–5/month). The same Docker setup works unchanged.

---

## 2. Accounts and keys you need

### Required

| What | Where you get it | Where it goes | Notes |
|---|---|---|---|
| **Provider API key(s)** | Each provider panel you buy from → Account / API page | **Admin panel → Providers** (not the `.env`) | Stored encrypted. Plus the provider's API URL, e.g. `https://provider.com/api/v2` |
| **Resend API key** | resend.com → API Keys | `.env` → `RESEND_API_KEY` | Needs your domain verified in Resend (§5.7) |
| **Cloudflare Tunnel token** | Cloudflare → Zero Trust → Networks → Tunnels | `.env` → `CLOUDFLARE_TUNNEL_TOKEN` | Connects the server without opening ports |
| **App secrets** (you generate) | `openssl rand -base64 48` on your computer or server | `.env` → `JWT_SECRET`, `ENCRYPTION_KEY`, `REVALIDATE_SECRET` | Keep a copy in a password manager. Changing `ENCRYPTION_KEY` later breaks saved provider keys |
| **Database passwords** (you generate) | `openssl rand -base64 24` | `.env` → `MYSQL_PASSWORD` (also inside `DATABASE_URL`), `MYSQL_ROOT_PASSWORD` | Use letters and numbers only (avoid `/ @ :` in the password) |
| **First admin login** (you choose) | — | `.env` → `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | Change the password and turn on 2FA after the first sign-in |

### Optional

| What | Where you get it | Where it goes |
|---|---|---|
| Google sign-in client ID + secret | Google Cloud Console → APIs & Services → Credentials (§5.11) | `.env` → `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, then turn it on in Admin → Settings |
| Backup storage keys (S3-compatible) | Oracle Object Storage → Customer Secret Keys (or R2 API token) | `rclone config` on the server (§5.10) |

### Not needed yet
- **Payment gateways** (Stripe, crypto, JazzCash…): Add funds shows "Coming soon". You add balance manually in Admin → Users.
- **Telegram**: deferred.
- **Exchange-rate API key**: the free source needs no key.

---

## 3. Before you start (on your computer)

1. A GitHub account with access to this repository.
2. An SSH key. Check with `ls ~/.ssh/id_ed25519.pub`. If missing, create one:
   `ssh-keygen -t ed25519 -C "you@example.com"` (press Enter at each prompt).
3. Generate the secrets now and paste them into a note:
   ```bash
   echo "JWT_SECRET=$(openssl rand -base64 48)"
   echo "ENCRYPTION_KEY=$(openssl rand -base64 32)"
   echo "REVALIDATE_SECRET=$(openssl rand -base64 32)"
   echo "MYSQL_PASSWORD=$(openssl rand -hex 20)"
   echo "MYSQL_ROOT_PASSWORD=$(openssl rand -hex 20)"
   ```
   On Windows, run these in Git Bash or WSL, or generate them on the server in step 5.5.

---

## 4. How it fits together

```
Visitor ──HTTPS──► Cloudflare (free SSL, CDN, firewall)
                        │  Cloudflare Tunnel (outbound connection from your server, no open ports)
                        ▼
           Oracle VM ── Docker Compose ──────────────────────────────┐
           │  cloudflared → nginx ─┬─► web (Next.js)  yourdomain.com  │
           │                       │                   admin.…         │
           │                       └─► api ×2 (Express) /api/*         │
           │  worker (orders, provider sync, emails, renewals)         │
           │  mysql 8 · redis 7       nightly backup → Object Storage  │
           └──────────────────────────────────────────────────────────┘
```

Database migrations and the first admin account are created automatically on every start (they're safe to re-run).

---

## 4b. No domain yet? Free DuckDNS address

You can go live without buying a domain, using a free permanent DuckDNS address:
`https://yourpanel.duckdns.org` (customers) and `https://admin.yourpanel.duckdns.org` (admin).
Caddy gets free HTTPS certificates for both automatically.

**What's different from the domain setup:**
- No Cloudflare protection (CDN, DDoS shield): the server is reached directly on ports 80/443.
- **No emails.** Resend can only send from a domain you own. Leave `RESEND_API_KEY` empty and turn **off**
  Admin → Settings → "Require email confirmation before ordering", or new customers can't order.
  Password-reset emails won't work either; reset passwords for customers from the admin panel if needed.
- Google sign-in works (use the DuckDNS address in Google Cloud).

**Steps (instead of 5.1, 5.2, 5.5 and 5.7):**
1. **duckdns.org** → sign in with Google or GitHub → type a name (e.g. `yourpanel`) → **add domain** → paste your
   Oracle server's public IP into **current ip** → **update ip**. `admin.yourpanel.duckdns.org` works automatically.
2. Oracle console → **Networking → Virtual cloud networks** → your VCN → **Subnets** → the public subnet →
   **Security** (or Security Lists) → **Default Security List** → **Add Ingress Rules**, twice:
   Source CIDR `0.0.0.0/0`, IP protocol **TCP**, destination port **80**; then the same for **443**.
3. On the server: `./deploy/open-web-ports.sh` (opens 80/443 in the server's own firewall).
4. In `.env`: `COMPOSE_PROFILES=caddy`, the three address lines with your DuckDNS name, `CLOUDFLARE_TUNNEL_TOKEN` empty.
5. `docker compose up -d --build` as in 5.8. The first HTTPS certificate takes about a minute.

**Moving to your own domain later (5 minutes):** buy the domain, do 5.1, 5.2, 5.5 and 5.7, then in `.env` set
`COMPOSE_PROFILES=tunnel`, the tunnel token, your new domain in the three address lines and the Resend key, and run
`docker compose up -d --build`. Optionally remove the 80/443 ingress rules afterwards.

---

## 5. Step by step

### 5.1 Buy the domain
- Easiest: **Cloudflare → Domain Registration → Register Domains** (sold at cost, no markup). It's then already on Cloudflare.
- Bought elsewhere (Namecheap, GoDaddy…)? Add it to Cloudflare in 5.2 and change its nameservers at your registrar to the two Cloudflare gives you. This can take a few hours.

### 5.2 Cloudflare (free plan)
1. Sign up at cloudflare.com → **Add a site** → enter your domain → pick **Free**.
2. **SSL/TLS → Overview**: set **Full**. Then **Edge Certificates**: turn on **Always Use HTTPS**.
3. **Security → Bots**: turn on **Bot Fight Mode**.
4. **Security → Settings**: Security level **Medium**.
5. Leave caching on defaults. The app sends the right cache headers.

### 5.3 Oracle Cloud Always Free server
1. Sign up at **cloud.oracle.com/free**.
   - A card is needed for identity checks. Always Free resources are never charged.
   - **Choose your home region carefully: it can't be changed later.** Pick one near your customers, e.g. Mumbai or Hyderabad for Pakistan/India, or Frankfurt or Amsterdam for Europe.
2. **Compute → Instances → Create instance**:
   - **Image**: Canonical **Ubuntu 24.04** (the aarch64 build).
   - **Shape**: Change shape → **Ampere** → `VM.Standard.A1.Flex` → **4 OCPU, 24 GB** memory. Use 2 OCPU / 12 GB if 4 isn't available.
   - **Networking**: keep the default VCN and **assign a public IPv4 address**.
   - **SSH keys**: paste the contents of `~/.ssh/id_ed25519.pub`.
   - **Boot volume**: set **100 GB**. Up to 200 GB total is free.
3. Click **Create**.
   - If you get **"Out of capacity"**, try another availability domain, try again later (early morning often works), or use 2 OCPU / 12 GB.
4. Copy the instance's **public IP**.

> Optional but recommended: **Billing → Upgrade to Pay As You Go**. You stay at $0 while using only Always Free resources, and Oracle stops reclaiming "idle" VMs. Add a **budget alert at $1** (Billing → Budgets) so any accidental paid resource emails you immediately.

### 5.4 Prepare the server
From your computer:
```bash
ssh ubuntu@YOUR_SERVER_IP
```
Then on the server:
```bash
git clone https://github.com/qasimkdr/SMM-Panel.git smm
cd smm
bash deploy/setup-server.sh
exit          # log out once so the docker permission applies
```
The script installs Docker, 4 GB swap, automatic security updates, fail2ban (blocks SSH brute force) and rclone.

> **Private repository?** Create a read-only token: GitHub → Settings → Developer settings → Fine-grained tokens → this repo only → **Contents: Read**. Clone with `git clone https://<TOKEN>@github.com/qasimkdr/SMM-Panel.git smm`.

You don't need to open any ports in Oracle's firewall. The tunnel connects outward, and only SSH (port 22, open by default) is used.

### 5.5 Create the Cloudflare Tunnel
1. Cloudflare dashboard → **Zero Trust**. The first time, choose a team name and the **Free** plan; it may ask for a card but costs $0.
2. **Networks → Tunnels → Create a tunnel** → **Cloudflared** → name it `smm-panel` → Save.
3. On the install page choose **Docker**. Copy only the long token after `--token`. That's your `CLOUDFLARE_TUNNEL_TOKEN`.
4. **Public Hostnames** tab → **Add a public hostname**, twice:

   | Subdomain | Domain | Service type | URL |
   |---|---|---|---|
   | *(empty)* | yourdomain.com | HTTP | `nginx:80` |
   | `admin` | yourdomain.com | HTTP | `nginx:80` |

   Optional: add `www` with the same settings, plus a Cloudflare **Redirect Rule** from `www` to the bare domain.

Cloudflare creates the DNS records automatically.

### 5.6 Fill in the settings file
On the server:
```bash
cd ~/smm
cp deploy/env.production.example .env
nano .env
```
Replace every `CHANGE_ME` and `yourdomain.com`:
- `PUBLIC_DOMAIN`, `ADMIN_DOMAIN`, `WEB_URL`: your domain.
- `DATABASE_URL`: put the same password as `MYSQL_PASSWORD` in it.
- Secrets from §3, the tunnel token, and your admin email and password.
- Leave `RESEND_API_KEY` empty for now if Resend isn't ready (emails are skipped and logged).

Save with **Ctrl+O, Enter, Ctrl+X**.

### 5.7 Email (Resend)
1. Sign up at **resend.com** → **Domains → Add domain** → your domain.
2. Resend shows 3–4 DNS records (DKIM TXT, SPF TXT, MX for bounces). Add each one in **Cloudflare → DNS → Add record** with **Proxy status: DNS only** (grey cloud).
3. Click **Verify** in Resend. It usually takes minutes, occasionally a few hours.
4. **API Keys → Create** with **Sending access** → copy it into `.env` as `RESEND_API_KEY`.
5. Set `MAIL_FROM="Your Panel <no-reply@yourdomain.com>"`.

Emails the panel sends: email confirmation, password reset, order completed/partial/canceled, ticket replies, child-panel suspension. Customers choose which non-security emails they get.

### 5.8 Start it
```bash
cd ~/smm
docker compose up -d --build
```
- The first build takes **10–20 minutes** on the ARM server. Later updates are faster.
- Check that everything is running:
  ```bash
  docker compose ps                 # all "running"/"healthy"; "migrate" shows "exited (0)"
  docker compose logs -f api        # Ctrl+C to stop following
  docker compose logs migrate       # should end with "Migrations applied" and "Seed complete"
  docker compose logs cloudflared   # "Registered tunnel connection" ×4
  ```
- Open `https://yourdomain.com`: you should see the landing page.
- Open `https://admin.yourdomain.com` and sign in with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.

> This is the first time these Docker images are built on a real server. If any build step fails, copy the last 30 lines of the output and send them to me.

### 5.9 First-time setup in the admin panel (15 minutes)
1. **Security**: open the customer site, sign in with the same account → **Security**, and turn on two-factor sign-in. Then change the password (Sign out → Forgot password).
2. **Settings**:
   - Panel name, tagline, SEO title and description.
   - Sign-ups on.
   - Require email confirmation: on once Resend works.
3. **Currencies**: turn off any you don't want. Rates update automatically every night, and you can type a fixed rate.
4. **Providers → Add provider**: API URL + key → **Test**. Then **Import**: select services → Import.
5. **Commission**: set the global % (default 20), and per provider/category if needed.
6. **Pages & notices**: edit Terms, Privacy and Refund policy. Post a welcome banner if you like.
7. **Test order**:
   - Create a customer account on the main site and confirm its email.
   - In Admin → Users, add $2 to it.
   - Place a small real order and watch it move to Processing → Completed.

### 5.10 Nightly backups (off-site, free)
**Option A: Oracle Object Storage** (20 GB Always Free, no extra signup)
1. Oracle console → **Storage → Buckets → Create bucket** `smm-backups` (Standard, private).
2. Profile icon → your user → **Customer Secret Keys → Generate**. Copy the **Access Key** and **Secret** (shown once).
3. Find your **namespace** (Profile → Tenancy → Object storage namespace) and region identifier (e.g. `ap-mumbai-1`).
4. On the server:
   ```bash
   rclone config create offsite s3 provider=Other \
     access_key_id=YOUR_ACCESS_KEY secret_access_key=YOUR_SECRET \
     endpoint=https://NAMESPACE.compat.objectstorage.REGION.oraclecloud.com \
     region=REGION no_check_bucket=true
   ./deploy/backup.sh          # test it once: should say "copied off-site"
   ```

**Option B: Cloudflare R2** (10 GB free; needs a payment method on file)
- `rclone config create offsite s3 provider=Cloudflare access_key_id=… secret_access_key=… endpoint=https://ACCOUNT_ID.r2.cloudflarestorage.com`

**Schedule it**: `crontab -e`, then add:
```
20 3 * * * cd /home/ubuntu/smm && ./deploy/backup.sh >> deploy/backups/backup.log 2>&1
```
It keeps 7 days on the server and 30 days off-site.

**Restore** (if ever needed):
```bash
gunzip -c deploy/backups/smm-YYYYMMDD-HHMM.sql.gz | docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" smm'
```

### 5.11 Optional: Sign in with Google
1. **console.cloud.google.com** → create a project → **APIs & Services → OAuth consent screen**:
   - User type: External.
   - App name, support email, your domain.
   - Scopes: `email`, `profile`, `openid`.
   - **Publish app**.
2. **Credentials → Create credentials → OAuth client ID → Web application**:
   - Authorized JavaScript origin: `https://yourdomain.com`
   - Authorized redirect URI: `https://yourdomain.com/api/auth/google/callback`
3. Put the client ID and secret in `.env`, then run `docker compose up -d` (restarts the API with the new keys).
4. Admin → **Settings → Sign-up & security** → turn on **Sign in with Google**.

### 5.12 Uptime alerts (free)
1. **uptimerobot.com** → Add monitor → HTTP(s):
   - `https://yourdomain.com/api/ready`: checks the database and Redis, not just the web server.
   - `https://yourdomain.com`
2. Set the alert contact to your email (and the mobile app for push alerts).

---

## 6. Everyday operations

| Task | Command (on the server, in `~/smm`) |
|---|---|
| Deploy an update from GitHub | `git pull && docker compose up -d --build` (migrations run automatically) |
| See what's running | `docker compose ps` |
| Live logs | `docker compose logs -f api worker` |
| Restart one part | `docker compose restart worker` |
| Change a secret in `.env` | edit `.env` → `docker compose up -d` |
| Backup now | `./deploy/backup.sh` |
| Disk usage / clean old images | `df -h` · `docker system prune -f` |

Most settings never need the server. Name, SEO, sign-ups, features, commission, currencies, VIP levels, pages and maintenance mode are all in the admin panel.

---

## 7. Security checklist before announcing the site
- [ ] Admin password changed and **two-factor on** for every admin and staff account
- [ ] `.env` has no `CHANGE_ME` left; a copy of the secrets is in your password manager
- [ ] Cloudflare: SSL **Full**, **Always Use HTTPS**, **Bot Fight Mode** on
- [ ] Backups run, and you've tested one restore on a spare database
- [ ] UptimeRobot alerts arrive (pause the API for a minute to test: `docker compose stop api`, then `start`)
- [ ] Terms, Privacy and Refund pages edited with your real policies
- [ ] Email confirmation required (Admin → Settings) once Resend works
- [ ] Staff accounts have only the permissions they need

---

## 8. Troubleshooting

| Symptom | Likely cause → fix |
|---|---|
| Cloudflare error 1033 / "tunnel not found" | `cloudflared` isn't running or the token is wrong → `docker compose logs cloudflared`, re-copy the token |
| 502 Bad Gateway | `web` or `api` still starting or crashed → `docker compose ps`, `docker compose logs api web` |
| Admin site shows the customer site | `ADMIN_DOMAIN` doesn't exactly match the hostname (no `https://`) → fix `.env`, then `docker compose up -d --build web` |
| Can't sign in (cookies not kept) | Visiting over `http://` → make sure **Always Use HTTPS** is on |
| No emails | `RESEND_API_KEY` empty or domain not verified → `docker compose logs worker`; daily limit is 100 on the free plan |
| Exchange rates never change | Server can't reach `open.er-api.com` → `docker compose logs worker`; set manual rates meanwhile (Admin → Currencies) |
| Build killed / very slow | Low memory → confirm swap exists (`swapon --show`); on 1–2 GB servers set `MYSQL_BUFFER_POOL=256M` |
| Oracle "Out of capacity" | Try another availability domain or later; or start on Hetzner CX22 (~€4–5/month) with the same steps from 5.4 |
| Live order updates don't appear | Something buffers the stream → nginx config already disables it; check no other proxy sits in between |

---

## 9. Not covered yet
- Payment gateways (Add funds is "Coming soon"; top up customers manually in Admin → Users).
- Telegram bot and alerts.
- Automated deployment of child panels: billing and renewals are automatic, but setting up the copy on the customer's domain is a manual step.
