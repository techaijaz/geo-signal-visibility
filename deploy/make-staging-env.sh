#!/usr/bin/env bash
# Writes staging's .env from production's: the same email settings, its own database and auth secrets,
# the staging domain and small limits (it shares the server with production). Payment keys are never
# copied. AI keys only with --copy-ai-keys (scans on staging then cost real money).
# Run on the server as the deploy user:
#   /opt/signal-ai-staging/deploy/make-staging-env.sh [--copy-ai-keys]
set -euo pipefail

prod=/opt/signal-ai/.env
out=/opt/signal-ai-staging/.env

if [ -e "$out" ]; then
    echo "$out already exists, not overwriting it" >&2
    exit 1
fi

secret() { openssl rand -hex 32; }

umask 077
{
    echo "# Staging, written by deploy/make-staging-env.sh on $(date -u +%Y-%m-%d)"
    echo 'DOMAIN=staging.geosignalai.com'
    echo 'COMPOSE_FILE=docker-compose.yml:docker-compose.staging.yml'
    echo 'IMAGE_VARIANT=-staging'
    echo 'NGINX_HTTP_BIND=127.0.0.1:8090'
    echo 'NGINX_HTTPS_BIND=127.0.0.1:8444'
    echo 'NGINX_TEMPLATES=./nginx/templates-behind-proxy'
    echo
    echo '# Small: production comes first on this server'
    echo 'MONGO_CACHE_GB=0.25'
    echo 'MONGO_MEM_LIMIT=512m'
    echo 'API_MEM_LIMIT=512m'
    echo 'WORKER_MEM_LIMIT=768m'
    echo 'SCAN_WORKER_CONCURRENCY=1'
    echo 'AUDIT_WORKER_CONCURRENCY=1'
    echo 'RECOMMENDATION_WORKER_CONCURRENCY=1'
    echo 'AI_PROVIDER_CONCURRENCY=2'
    echo
    echo '# Own database and secrets, nothing shared with production'
    echo 'MONGO_USER=signal'
    echo "MONGO_PASSWORD=$(secret)"
    echo 'MONGO_DB=signal'
    echo "REDIS_PASSWORD=$(secret)"
    echo "ACCESS_TOKEN_SECRET=$(secret)"
    echo "REFRESH_TOKEN_SECRET=$(secret)"
    echo 'RATE_LIMIT_PER_MINUTE=120'
    echo
    echo '# Email, as in production (staging only has test accounts)'
    grep -E '^(EMAIL_|SMTP_|RESEND_)' "$prod" || true
    echo
    echo '# Payments: test keys only, never the live ones'
    echo 'RAZORPAY_KEY_ID='
    echo 'RAZORPAY_KEY_SECRET='
    echo 'STRIPE_SECRET_KEY='
    echo 'STRIPE_PUBLISHABLE_KEY='
    echo
    echo '# AI provider keys (can also be set from Admin > API Keys on staging)'
    if [ "${1:-}" = --copy-ai-keys ]; then
        grep -E '^(OPENAI|GEMINI|ANTHROPIC|XAI|DEEPSEEK|PERPLEXITY)_API_KEY=' "$prod" || true
    else
        printf '%s=\n' OPENAI_API_KEY GEMINI_API_KEY ANTHROPIC_API_KEY XAI_API_KEY DEEPSEEK_API_KEY PERPLEXITY_API_KEY
    fi
} >"$out"

echo "wrote $out"
