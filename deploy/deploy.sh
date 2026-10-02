#!/usr/bin/env bash
# Deploys one commit: the code (compose file, nginx config, scripts) from git, the images from ghcr.io.
# The Deploy workflow runs it over SSH as the deploy user, always the copy from the commit being deployed:
#   cd /opt/signal-ai && git fetch -q origin && bash <(git show <sha>:deploy/deploy.sh) <sha>
# Takes a MongoDB backup first. If api or worker are not healthy after the switch, it puts the
# previous version (code and images) back and exits with an error.
set -euo pipefail

sha="${1:?Usage: deploy.sh <full commit sha>}"
cd "${APP_DIR:-/opt/signal-ai}"

services=(api worker frontend website)
registry=$(grep -E '^IMAGE_REGISTRY=' .env | cut -d= -f2- || true)
registry="${registry:-ghcr.io/techaijaz}"

log() { echo "[deploy $(date -u +%H:%M:%S)] $*"; }

# api and worker share the backend image
image_of() { case "$1" in api | worker) echo backend ;; *) echo "$1" ;; esac; }

# Remember the tag in .env, so a manual `docker compose up -d` keeps running this version
save_tag() {
    if grep -q '^IMAGE_TAG=' .env; then
        sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=$1/" .env
    else
        printf '\nIMAGE_TAG=%s\n' "$1" >>.env
    fi
}

container_of() { docker compose ps -q "$1" | head -n 1; }

wait_healthy() {
    local deadline=$((SECONDS + 180)) s status
    for s in api worker; do
        while :; do
            status=$(docker inspect -f '{{.State.Health.Status}}' "$(container_of "$s")" 2>/dev/null || echo missing)
            [ "$status" = healthy ] && break
            if [ "$SECONDS" -ge "$deadline" ]; then
                log "$s is $status after 3 minutes"
                return 1
            fi
            sleep 5
        done
        log "$s is healthy"
    done
    for s in frontend website nginx; do
        if [ "$(docker inspect -f '{{.State.Running}}' "$(container_of "$s")" 2>/dev/null)" != true ]; then
            log "$s is not running"
            return 1
        fi
    done
}

prev_sha=$(git rev-parse HEAD)
log "running $prev_sha, deploying $sha"

# Tag the images running now as :rollback, the way back if the new version fails. An image that lost
# its name (rebuilt while the container kept running) can't be tagged by ID on the containerd image
# store, so fall back to the name the container was started from
for s in "${services[@]}"; do
    id=$(container_of "$s")
    [ -n "$id" ] || continue
    ref="$registry/signal-ai-$(image_of "$s"):rollback"
    docker tag "$(docker inspect -f '{{.Image}}' "$id")" "$ref" 2>/dev/null ||
        docker tag "$(docker inspect -f '{{.Config.Image}}' "$id")" "$ref" ||
        log "warning: no rollback image for $s"
done

log "backing up MongoDB"
deploy/backup-mongo.sh

git checkout -q --detach "$sha"
export IMAGE_TAG="$sha"

log "pulling images"
docker compose pull -q "${services[@]}"
docker compose up -d --no-build

if wait_healthy; then
    save_tag "$sha"
    # Unused images older than a week (old versions); the :rollback ones from the last deploys stay
    docker image prune -af --filter until=168h >/dev/null
    log "deployed $sha"
    exit 0
fi

log "new version is not healthy, rolling back to $prev_sha"
docker compose logs --tail 40 api worker || true
git checkout -q --detach "$prev_sha"
export IMAGE_TAG=rollback
docker compose up -d --no-build
save_tag rollback
wait_healthy && log "rolled back to $prev_sha" || log "ROLLBACK IS NOT HEALTHY EITHER, check the server"
exit 1
