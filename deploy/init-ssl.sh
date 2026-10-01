#!/usr/bin/env bash
# Get the first Let's Encrypt certificate for DOMAIN, www.DOMAIN, app.DOMAIN and status.DOMAIN.
# Run once, before `docker compose up`, with DNS already pointing at this server.
set -euo pipefail
cd "$(dirname "$0")/.."

set -a; source .env; set +a
: "${DOMAIN:?Set DOMAIN in .env}"
: "${LETSENCRYPT_EMAIL:?Set LETSENCRYPT_EMAIL in .env}"

if [ -f "data/certbot/conf/live/$DOMAIN/fullchain.pem" ]; then
  echo "Certificate for $DOMAIN already exists. Renewals run from deploy/renew-ssl.sh."
  exit 0
fi

mkdir -p data/certbot/conf data/certbot/www
docker compose stop nginx 2>/dev/null || true

# Standalone mode: certbot answers the challenge itself on port 80
docker compose run --rm -p 80:80 certbot certonly --standalone \
  -d "$DOMAIN" -d "www.$DOMAIN" -d "app.$DOMAIN" -d "status.$DOMAIN" \
  --email "$LETSENCRYPT_EMAIL" --agree-tos --no-eff-email

echo "Certificate issued. Now run: docker compose up -d --build"
