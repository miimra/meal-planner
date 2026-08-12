#!/usr/bin/env bash

# Build and deploy the PocketBase/Next.js image on the ARM64 printer server.
#
# This script intentionally does not print the contents of the production env
# file.  On the first run, that file is migrated from the existing container's
# environment before the old container is replaced.

set -Eeuo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
REMOTE_HOST="${REMOTE_HOST:-raptor@printer-server.local}"
REMOTE_ROOT="${REMOTE_ROOT:-/home/raptor/services/meal-planner}"

if ! command -v git >/dev/null 2>&1; then
  echo "git is required" >&2
  exit 1
fi
for command_name in ssh scp tar mktemp; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "$command_name is required" >&2
    exit 1
  fi
done

commit="$(git -C "$REPO_ROOT" rev-parse --short=12 HEAD)"
if [[ -z "$commit" ]]; then
  echo "could not determine the Git commit" >&2
  exit 1
fi

work_dir="$(mktemp -d "${TMPDIR:-/tmp}/meal-planner-deploy.XXXXXXXX")"
archive="$work_dir/meal-planner-$commit.tar.gz"
remote_archive="/tmp/meal-planner-$commit.tar.gz"
cleanup() {
  rm -rf -- "$work_dir"
}
trap cleanup EXIT

echo "Packaging meal-planner at commit $commit"
tar -czf "$archive" \
  --exclude=.git \
  --exclude=node_modules \
  --exclude=.next \
  --exclude=out \
  --exclude=pb_data \
  --exclude=.env \
  --exclude=.env.local \
  --exclude=.env.production \
  --exclude='*.tar.gz' \
  --exclude='*.tgz' \
  -C "$REPO_ROOT" .

echo "Transferring deployment package to $REMOTE_HOST"
scp "$archive" "$REMOTE_HOST:$remote_archive"

# Keep this heredoc single-quoted: local shell expansion must never expose or
# alter the remote deployment script.  The only values passed to it are the
# package path and the non-secret Git commit tag.
ssh "$REMOTE_HOST" bash -s -- "$remote_archive" "$commit" "$REMOTE_ROOT" <<'REMOTE_DEPLOY_SCRIPT'
#!/usr/bin/env bash
set -Eeuo pipefail

archive_path="$1"
commit_tag="$2"
service_root="$3"
release_root="$service_root/releases"
env_file="$service_root/meal-planner.env"
backup_root="$service_root/backups"
volume_name="meal-planner-pb-data"
container_name="meal-planner"
image_repo="meal-planner"
image_tag="$image_repo:$commit_tag"
deploy_id="$(date -u +%Y%m%dT%H%M%SZ)-$$"
old_container_name="${container_name}.rollback.${deploy_id}"
old_container_image=""
old_container_image_id=""
old_container_running="false"
old_container_present="false"

fail() {
  echo "deployment failed: $*" >&2
  exit 1
}

for command_name in docker tar curl install find sort awk; do
  command -v "$command_name" >/dev/null 2>&1 || fail "$command_name is required on the deployment host"
done

mkdir -p "$release_root" "$backup_root"

# Migrate the current container environment only when no protected env file
# exists yet.  The inspect output is redirected to a temporary file and is
# never sent to stdout/stderr.
if [[ ! -e "$env_file" ]]; then
  current_container_id="$(docker ps -aq --filter "name=^/${container_name}$" | head -n 1)"
  [[ -n "$current_container_id" ]] || fail "no existing $container_name container; create $env_file (mode 0600) before the first deployment"
  migrated_env="$(mktemp)"
  cleanup_migrated_env() {
    rm -f -- "$migrated_env"
  }
  trap cleanup_migrated_env EXIT
  docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$current_container_id" >"$migrated_env"
  install -m 600 "$migrated_env" "$env_file"
  rm -f -- "$migrated_env"
  trap - EXIT
fi
[[ -f "$env_file" ]] || fail "$env_file is not a regular file"
chmod 600 "$env_file"

docker volume inspect "$volume_name" >/dev/null 2>&1 || fail "required persistent volume $volume_name does not exist"

# Capture and tag the exact running image by immutable ID before building. This
# remains correct even when a dirty working tree is redeployed under the same
# Git commit tag.
if docker container inspect "$container_name" >/dev/null 2>&1; then
  old_container_present="true"
  old_container_image="$(docker inspect --format '{{.Config.Image}}' "$container_name")"
  old_container_image_id="$(docker inspect --format '{{.Image}}' "$container_name")"
  old_container_running="$(docker inspect --format '{{.State.Running}}' "$container_name")"
  docker tag "$old_container_image_id" "$image_repo:previous"
fi

# Back up the live PocketBase volume before stopping the old application.
backup_file="$backup_root/$volume_name-$deploy_id.tar.gz"
docker run --rm \
  -v "$volume_name:/source:ro" \
  -v "$backup_root:/backup" \
  alpine:3.20 tar -czf "/backup/$(basename "$backup_file")" -C /source .

# Keep the last eight volume archives.  File names and timestamps are handled
# without printing their contents (which are application data).
find "$backup_root" -maxdepth 1 -type f -name "$volume_name-*.tar.gz" -printf '%T@ %p\n' \
  | sort -nr \
  | awk 'NR > 8 { sub(/^[^ ]+ /, ""); print }' \
  | while IFS= read -r old_backup; do
      [[ -z "$old_backup" ]] || rm -f -- "$old_backup"
    done

release_dir="$release_root/$commit_tag"
rm -rf -- "$release_dir"
mkdir -p "$release_dir"
tar -xzf "$archive_path" -C "$release_dir"
rm -f -- "$archive_path"

# Build for the server's ARM64 runtime. Buildx is preferred because it can
# explicitly load the requested platform image; the classic builder fallback
# is useful on older Docker installations running directly on ARM64.
if docker buildx version >/dev/null 2>&1; then
  docker buildx build --platform linux/arm64 --load --tag "$image_tag" "$release_dir"
else
  docker build --platform linux/arm64 --tag "$image_tag" "$release_dir"
fi

if [[ "$old_container_present" == "true" ]]; then
  # Retain the stopped container until the health check has passed.
  if [[ "$old_container_running" == "true" ]]; then
    docker stop "$container_name" >/dev/null
  fi
  docker rename "$container_name" "$old_container_name"
fi

rollback() {
  echo "new container failed its health check; restoring the previous container" >&2
  docker rm -f "$container_name" >/dev/null 2>&1 || true
  if [[ "$old_container_present" == "true" ]] && docker container inspect "$old_container_name" >/dev/null 2>&1; then
    docker rename "$old_container_name" "$container_name" >/dev/null
    if [[ "$old_container_running" == "true" ]]; then
      docker start "$container_name" >/dev/null
    fi
  fi
}

new_container_id=""
if ! new_container_id="$(docker run -d \
    --name "$container_name" \
    --restart unless-stopped \
    --env-file "$env_file" \
    -p 8091:8090 \
    -v "$volume_name:/pb/pb_data" \
    "$image_tag")"; then
  rollback
  fail "docker could not start $container_name"
fi

healthy="false"
for attempt in $(seq 1 60); do
  if curl --fail --silent --show-error --max-time 3 http://127.0.0.1:8091/api/health >/dev/null 2>&1; then
    healthy="true"
    break
  fi
  sleep 2
done

if [[ "$healthy" != "true" ]]; then
  rollback
  fail "health check failed at http://127.0.0.1:8091/api/health"
fi

if [[ "$old_container_present" == "true" ]]; then
  docker rm "$old_container_name" >/dev/null
fi

# Keep recent commit-tagged images for a manual rollback.  The current and
# previous aliases are always preserved; older commit tags are trimmed after
# the newest eight tags.
mapfile -t image_tags < <(docker image ls --format '{{.Tag}}' "$image_repo" | grep -E '^[0-9a-f]{7,64}$' || true)
if (( ${#image_tags[@]} > 8 )); then
  for old_tag in "${image_tags[@]:8}"; do
    [[ "$old_tag" == "$commit_tag" ]] || docker image rm "$image_repo:$old_tag" >/dev/null 2>&1 || true
  done
fi

echo "Deployed $image_tag on $(hostname)"
echo "Health check passed: http://127.0.0.1:8091/api/health"
REMOTE_DEPLOY_SCRIPT

echo "Deployment completed for commit $commit"
