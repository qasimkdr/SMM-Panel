#!/usr/bin/env bash
# One-command installer for a fresh Ubuntu server (Oracle Cloud Always Free or any VPS).
# Asks 3 questions, generates every secret, prepares the server and starts the panel.
#
#   curl -fsSL https://raw.githubusercontent.com/qasimkdr/SMM-Panel/main/deploy/install.sh | bash
#
# Safe to run again: it keeps an existing .env (and its secrets) unless you choose to replace it.
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/qasimkdr/SMM-Panel.git}"
DIR="${DIR:-$HOME/smm}"
say() { printf '\n\033[1;33m==> %s\033[0m\n' "$*"; }
ask() { local p="$1" d="${2:-}" v; read -r -p "$p${d:+ [$d]}: " v </dev/tty; echo "${v:-$d}"; }

say "1/6 Updating the server (takes a few minutes)"
sudo apt-get update -y -q
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -q
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -q ca-certificates curl git openssl unattended-upgrades fail2ban rclone iptables-persistent

say "2/6 Installing Docker"
if ! command -v docker >/dev/null 2>&1; then curl -fsSL https://get.docker.com | sudo sh; fi
sudo usermod -aG docker "$USER" || true
sudo mkdir -p /etc/docker
echo '{ "log-driver": "json-file", "log-opts": { "max-size": "20m", "max-file": "5" } }' | sudo tee /etc/docker/daemon.json >/dev/null
sudo systemctl enable --now docker
sudo systemctl restart docker

say "3/6 Swap, automatic security updates, firewall ports 80/443"
if ! swapon --show | grep -q /swapfile; then
  sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile >/dev/null && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi
sudo dpkg-reconfigure -f noninteractive unattended-upgrades >/dev/null 2>&1 || true
for port in 80 443; do
  sudo iptables -C INPUT -p tcp --dport "$port" -m state --state NEW -j ACCEPT 2>/dev/null \
    || sudo iptables -I INPUT 5 -p tcp --dport "$port" -m state --state NEW -j ACCEPT
done
sudo iptables -C INPUT -p udp --dport 443 -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 5 -p udp --dport 443 -j ACCEPT
sudo netfilter-persistent save >/dev/null

say "4/6 Downloading the panel"
if [ -d "$DIR/.git" ]; then git -C "$DIR" pull --ff-only; else git clone "$REPO_URL" "$DIR"; fi
cd "$DIR"

say "5/6 Settings"
write_env=yes
if [ -f .env ]; then
  keep=$(ask "Settings already exist. Keep them? (yes/no)" "yes")
  [ "$keep" = "yes" ] && write_env=no
fi
if [ "$write_env" = "yes" ]; then
  DOMAIN=$(ask "Your address (no https://)" "viraloft.duckdns.org")
  NAME=$(ask "Panel name" "Viraloft")
  EMAIL=$(ask "Admin email (your sign-in)")
  while true; do
    read -r -s -p "Admin password (min 10 characters, no ' quote): " PASS </dev/tty; echo
    read -r -s -p "Type it again: " PASS2 </dev/tty; echo
    if [ "${#PASS}" -lt 10 ]; then echo "Too short, try again."; continue; fi
    if [[ "$PASS" == *"'"* ]]; then echo "Please avoid the ' character."; continue; fi
    [ "$PASS" = "$PASS2" ] && break || echo "They don't match, try again."
  done
  DBPASS=$(openssl rand -hex 20)
  umask 077
  cat > .env <<EOF
NODE_ENV=production
APP_NAME='${NAME}'
COMPOSE_PROFILES=caddy
PUBLIC_DOMAIN=${DOMAIN}
ADMIN_DOMAIN=admin.${DOMAIN}
WEB_URL=https://${DOMAIN}
API_URL=http://api:4000
WEB_INTERNAL_URL=http://web:3000
NEXT_PUBLIC_API_URL=/api
DATABASE_URL=mysql://smm:${DBPASS}@mysql:3306/smm
REDIS_URL=redis://redis:6379
MYSQL_PASSWORD=${DBPASS}
MYSQL_ROOT_PASSWORD=$(openssl rand -hex 20)
MYSQL_BUFFER_POOL=2G
JWT_SECRET=$(openssl rand -hex 48)
ENCRYPTION_KEY=$(openssl rand -base64 32 | tr -d '\n')
REVALIDATE_SECRET=$(openssl rand -hex 24)
CLOUDFLARE_TUNNEL_TOKEN=
RESEND_API_KEY=
MAIL_FROM='${NAME} <no-reply@${DOMAIN}>'
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
SEED_ADMIN_EMAIL=${EMAIL}
SEED_ADMIN_PASSWORD='${PASS}'
API_REPLICAS=2
ORDER_CONCURRENCY=20
STATUS_POLL_MS=60000
LOG_LEVEL=info
EOF
  echo "Saved settings to $DIR/.env (secrets generated automatically; keep this file private)."
fi

say "6/6 Building and starting (first time: 10–20 minutes, keep this screen open)"
sudo docker compose up -d --build

DOMAIN_NOW=$(grep '^PUBLIC_DOMAIN=' .env | cut -d= -f2)
say "Waiting for the site to answer"
for i in $(seq 1 60); do
  if curl -fsS -o /dev/null "https://${DOMAIN_NOW}/api/ready" 2>/dev/null; then ok=1; break; fi
  sleep 10
done
sudo docker compose ps
if [ "${ok:-}" = 1 ]; then
  cat <<MSG

  ✅ Live!
     Customer site:  https://${DOMAIN_NOW}
     Admin panel:    https://admin.${DOMAIN_NOW}   (sign in with the admin email + password you chose)

MSG
else
  cat <<MSG

  The containers are up but https://${DOMAIN_NOW} isn't answering yet. Check:
   • DuckDNS shows this server's public IP
   • Oracle Security List allows TCP 80 and 443 from 0.0.0.0/0
   • Logs:  cd $DIR && sudo docker compose logs --tail=50 caddy api web
MSG
fi
