#!/usr/bin/env bash
#
# Pull-based CD for tggr on the NAS.
# Polls GitHub; if the tracked branch has a new commit, it rebuilds and
# restarts the container. Safe to run on a timer (cron/systemd) — it does
# nothing when already up to date, and won't overlap with itself.
#
# One-time setup on the NAS:
#   cp deploy.sh /DATA/deploy-tggr.sh      # copy OUT of the repo (see note)
#   chmod +x /DATA/deploy-tggr.sh
# then add the cron line shown in DEPLOYMENT.md.
#
# NOTE: run the COPY at /DATA/deploy-tggr.sh, not the one inside the repo —
# `git reset` below rewrites files in the repo, and a script shouldn't modify
# itself while running.

set -euo pipefail

# --- config (override via env if your paths differ) ---
REPO_DIR="${REPO_DIR:-$HOME/tggr-new}"
BRANCH="${BRANCH:-master}"
export DOCKER_CONFIG="${DOCKER_CONFIG:-/DATA/.docker}"   # ZimaOS: /root is read-only
# ------------------------------------------------------

# Prevent overlapping runs if a build outlasts the poll interval.
exec 9>/tmp/tggr-deploy.lock
flock -n 9 || { echo "$(date '+%F %T') another deploy is running, skipping"; exit 0; }

cd "$REPO_DIR"

if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DC="docker-compose"
else
  echo "ERROR: neither 'docker compose' nor 'docker-compose' found" >&2
  exit 1
fi

git fetch --quiet origin "$BRANCH"
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "origin/$BRANCH")

if [ "$LOCAL" = "$REMOTE" ]; then
  echo "$(date '+%F %T') up to date (${LOCAL:0:7})"
  exit 0
fi

echo "$(date '+%F %T') new commit ${REMOTE:0:7}, deploying..."
git reset --hard "origin/$BRANCH"     # data/ is gitignored — DB and files untouched

$DC down || true
$DC build
$DC up -d
docker image prune -f || true

echo "$(date '+%F %T') deployed ${REMOTE:0:7}"
