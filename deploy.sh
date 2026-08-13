#!/usr/bin/env bash
set -Eeuo pipefail

root="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$root"

volume="meal-planner-pb-data"
container="meal-planner"
backup_dir="$root/backups"

for command_name in git docker curl; do
  command -v "$command_name" >/dev/null 2>&1 || { echo "$command_name is required" >&2; exit 1; }
done
docker compose version >/dev/null 2>&1 || { echo "Docker Compose v2 is required" >&2; exit 1; }
[[ -f .env ]] || { echo "Create $root/.env before deploying" >&2; exit 1; }
chmod 600 .env

git checkout master
git pull --ff-only origin master
commit="$(git rev-parse --short=12 HEAD)"
image="meal-planner:$commit"

docker volume inspect "$volume" >/dev/null 2>&1 || docker volume create "$volume" >/dev/null
mkdir -p "$backup_dir"

old_image_id="$(docker inspect --format '{{.Image}}' "$container" 2>/dev/null || true)"
if [[ -n "$old_image_id" ]]; then
  docker tag "$old_image_id" meal-planner:rollback
fi

backup="$backup_dir/$volume-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"
docker run --rm -v "$volume:/source:ro" -v "$backup_dir:/backup" \
  alpine:3.20 tar -czf "/backup/$(basename "$backup")" -C /source .
find "$backup_dir" -maxdepth 1 -type f -name "$volume-*.tar.gz" -printf '%T@ %p\n' \
  | sort -nr | awk 'NR > 8 { sub(/^[^ ]+ /, ""); print }' \
  | while IFS= read -r old_backup; do [[ -z "$old_backup" ]] || rm -f -- "$old_backup"; done

MEAL_PLANNER_IMAGE="$image" docker compose build meal-planner
docker rm -f "$container" >/dev/null 2>&1 || true

rollback() {
  echo "Deployment failed; restoring meal-planner:rollback" >&2
  docker rm -f "$container" >/dev/null 2>&1 || true
  if docker image inspect meal-planner:rollback >/dev/null 2>&1; then
    MEAL_PLANNER_IMAGE=meal-planner:rollback docker compose up -d --no-build --remove-orphans
  fi
}

if ! MEAL_PLANNER_IMAGE="$image" docker compose up -d --no-build --remove-orphans; then
  rollback
  exit 1
fi

healthy=false
for _ in $(seq 1 60); do
  if curl --fail --silent --max-time 3 http://127.0.0.1:8091/api/health >/dev/null; then
    healthy=true
    break
  fi
  sleep 2
done

if [[ "$healthy" != true ]]; then
  rollback
  exit 1
fi

echo "Deployed $image from master"
echo "Health check passed: http://127.0.0.1:8091/api/health"
