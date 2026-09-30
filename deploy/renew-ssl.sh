#!/usr/bin/env bash
# Renew certificates close to expiry and reload nginx. Safe to run daily from cron:
#   0 3 * * * /opt/signal-ai/deploy/renew-ssl.sh >> /var/log/signal-ssl.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."

# Webroot mode: nginx serves the challenge from data/certbot/www, so the site stays up
docker compose run --rm certbot renew --webroot -w /var/www/certbot --quiet
docker compose exec -T nginx nginx -s reload
