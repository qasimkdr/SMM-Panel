#!/usr/bin/env bash
# Only for the "no domain yet" setup (COMPOSE_PROFILES=caddy): lets ports 80/443 through the
# server's own firewall. Oracle's Ubuntu images block everything except SSH by default.
# You ALSO need to allow 80/443 in Oracle's console (VCN → Security List), see docs/DEPLOY.md.
set -euo pipefail
for port in 80 443; do
  sudo iptables -C INPUT -p tcp --dport "$port" -m state --state NEW -j ACCEPT 2>/dev/null \
    || sudo iptables -I INPUT 5 -p tcp --dport "$port" -m state --state NEW -j ACCEPT
done
sudo iptables -C INPUT -p udp --dport 443 -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 5 -p udp --dport 443 -j ACCEPT
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y iptables-persistent >/dev/null
sudo netfilter-persistent save
echo "Ports 80 and 443 are open on this server."
