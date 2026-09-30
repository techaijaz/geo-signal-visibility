#!/usr/bin/env bash
# Daily MongoDB backup, keeping the last 14. Run from cron:
#   30 2 * * * /opt/signal-ai/deploy/backup-mongo.sh >> /var/log/signal-backup.log 2>&1
# Copy the backups folder off the server too (Hostinger snapshots, S3, Google Drive via rclone...).
set -euo pipefail
cd "$(dirname "$0")/.."

set -a; source .env; set +a
mkdir -p backups
file="backups/mongo-$(date +%Y-%m-%d-%H%M).archive.gz"

docker compose exec -T mongo mongodump \
  --username "$MONGO_USER" --password "$MONGO_PASSWORD" --authenticationDatabase admin \
  --db "${MONGO_DB:-signal}" --archive --gzip > "$file"

ls -1t backups/mongo-*.archive.gz | tail -n +15 | xargs -r rm --
echo "$(date -Is) backup written: $file ($(du -h "$file" | cut -f1))"
