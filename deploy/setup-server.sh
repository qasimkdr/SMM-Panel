#!/usr/bin/env bash
# One-time server preparation for Ubuntu 22.04 / 24.04 (x86 or ARM, e.g. Oracle Cloud Always Free).
# Run as the default user (ubuntu) with sudo rights:
#   curl -fsSL https://raw.githubusercontent.com/<you>/<repo>/main/deploy/setup-server.sh -o setup.sh   (or copy it)
#   bash setup.sh
set -euo pipefail

echo "==> Updating the system"
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl git unattended-upgrades fail2ban rclone

echo "==> Installing Docker (official convenience script)"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
fi
sudo usermod -aG docker "$USER"
sudo systemctl enable --now docker

echo "==> Adding 4 GB swap (protects against memory spikes during builds)"
if ! swapon --show | grep -q swapfile; then
  sudo fallocate -l 4G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

echo "==> Automatic security updates"
sudo dpkg-reconfigure -f noninteractive unattended-upgrades

echo "==> Docker log rotation"
sudo mkdir -p /etc/docker
echo '{ "log-driver": "json-file", "log-opts": { "max-size": "20m", "max-file": "5" } }' | sudo tee /etc/docker/daemon.json >/dev/null
sudo systemctl restart docker

cat <<'MSG'

Done. Log out and back in (so the docker group applies), then:
  git clone https://github.com/<you>/<repo>.git smm && cd smm
  cp deploy/env.production.example .env && nano .env
  docker compose up -d --build

No inbound ports are needed besides SSH: the site is served through Cloudflare Tunnel.
MSG
