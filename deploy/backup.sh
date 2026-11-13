#!/usr/bin/env bash
# Nightly database backup: dump → gzip → keep 7 locally → copy to free off-site storage with rclone.
# Install once:   crontab -e   and add:
#   20 3 * * * cd /home/ubuntu/smm && ./deploy/backup.sh >> deploy/backups/backup.log 2>&1
# Off-site target: an rclone remote named "offsite" (Oracle Object Storage or Cloudflare R2, see docs/DEPLOY.md).
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a

mkdir -p deploy/backups
STAMP=$(date -u +%Y%m%d-%H%M)
FILE="deploy/backups/smm-${STAMP}.sql.gz"

# --single-transaction: consistent snapshot without locking customers out.
docker compose exec -T mysql sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --quick --routines --no-tablespaces smm' | gzip -9 > "$FILE"
echo "$(date -u) backup written: $FILE ($(du -h "$FILE" | cut -f1))"

ls -1t deploy/backups/smm-*.sql.gz | tail -n +8 | xargs -r rm -f

if rclone listremotes 2>/dev/null | grep -q '^offsite:'; then
  rclone copy "$FILE" "offsite:${BACKUP_BUCKET:-smm-backups}/" --s3-no-check-bucket
  # Keep 30 days off-site.
  rclone delete "offsite:${BACKUP_BUCKET:-smm-backups}/" --min-age 30d --s3-no-check-bucket || true
  echo "$(date -u) copied off-site"
else
  echo "$(date -u) WARNING: no rclone remote named 'offsite' — backup is only on this server"
fi

# Restore (when needed):
#   gunzip -c deploy/backups/smm-YYYYMMDD-HHMM.sql.gz | docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" smm'
