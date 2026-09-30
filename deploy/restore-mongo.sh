#!/usr/bin/env bash
# Restore a backup made by backup-mongo.sh. This REPLACES the current data.
#   deploy/restore-mongo.sh backups/mongo-2026-10-01-0230.archive.gz
set -euo pipefail
cd "$(dirname "$0")/.."

file="${1:?Usage: deploy/restore-mongo.sh <backup file>}"
set -a; source .env; set +a

read -r -p "Replace the ${MONGO_DB:-signal} database with $file? Type yes: " answer
[ "$answer" = "yes" ] || { echo "Cancelled."; exit 1; }

docker compose exec -T mongo mongorestore \
  --username "$MONGO_USER" --password "$MONGO_PASSWORD" --authenticationDatabase admin \
  --archive --gzip --drop < "$file"
echo "Restored $file"
