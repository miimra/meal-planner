#!/usr/bin/env bash
set -Eeuo pipefail

root="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$root"

expected_commit="${1:-}"
volume="meal-planner-pb-data"
container="meal-planner"
backup_dir="$root/backups"

for command_name in git docker curl awk; do
  command -v "$command_name" >/dev/null 2>&1 || { echo "$command_name is required" >&2; exit 1; }
done
docker compose version >/dev/null 2>&1 || { echo "Docker Compose v2 is required" >&2; exit 1; }
[[ -n "$expected_commit" && "$(git rev-parse HEAD)" == "$expected_commit" ]] || {
  echo "The production checkout does not match the requested commit" >&2
  exit 1
}
git diff --quiet && git diff --cached --quiet || {
  echo "The production checkout contains tracked changes" >&2
  exit 1
}
[[ -f .env ]] || { echo "Create $root/.env before deploying" >&2; exit 1; }
chmod 600 .env

env_value() {
  awk -F= -v key="$1" '$1 == key { print substr($0, index($0, "=") + 1); exit }' .env
}

telegram_token="$(env_value TELEGRAM_BOT_TOKEN)"
telegram_secret="$(env_value TELEGRAM_WEBHOOK_SECRET)"
public_base="$(env_value PUBLIC_BASE_URL)"
public_base="${public_base:-https://meals.example.com}"
[[ -n "$telegram_token" ]] || { echo "TELEGRAM_BOT_TOKEN is missing from .env" >&2; exit 1; }
[[ ${#telegram_secret} -ge 24 ]] || { echo "TELEGRAM_WEBHOOK_SECRET must contain at least 24 characters" >&2; exit 1; }

short_commit="$(git rev-parse --short=12 HEAD)"
image="meal-planner:$short_commit"

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
echo "PocketBase backup created: $backup"

MEAL_PLANNER_IMAGE="$image" docker compose build meal-planner

rollback() {
  echo "Deployment failed; restoring meal-planner:rollback" >&2
  if docker image inspect meal-planner:rollback >/dev/null 2>&1; then
    MEAL_PLANNER_IMAGE=meal-planner:rollback docker compose up -d --no-build --force-recreate --remove-orphans
  fi
}

if ! MEAL_PLANNER_IMAGE="$image" docker compose up -d --no-build --force-recreate --remove-orphans; then
  rollback
  exit 1
fi

healthy=false
for _ in $(seq 1 60); do
  if curl --fail --silent --max-time 3 http://127.0.0.1:8091/api/health >/dev/null \
    && curl --fail --silent --max-time 3 http://127.0.0.1:8091/ >/dev/null; then
    healthy=true
    break
  fi
  sleep 2
done

if [[ "$healthy" != true ]]; then
  rollback
  exit 1
fi

telegram_call() {
  local method="$1"
  shift
  local response
  response="$(curl --fail --silent --show-error --request POST \
    "https://api.telegram.org/bot${telegram_token}/${method}" "$@")"
  [[ "$response" == *'"ok":true'* ]] || {
    echo "Telegram $method failed" >&2
    return 1
  }
}

commands='[{"command":"home","description":"Open the household dashboard"},{"command":"meals","description":"View or change meal plans"},{"command":"ask","description":"Ask a household question"},{"command":"settings","description":"Daily updates and help"}]'
telegram_call setMyCommands --data-urlencode "commands=$commands"
telegram_call setWebhook \
  --data-urlencode "url=${public_base%/}/api/telegram/webhook" \
  --data-urlencode "secret_token=$telegram_secret" \
  --data-urlencode 'allowed_updates=["message","callback_query"]'
telegram_call getWebhookInfo

docker tag "$image" meal-planner:latest

echo "Deployed $image"
echo "Local health checks passed: API and public app"
echo "Telegram commands and webhook registered"
