#!/usr/bin/env bash
set -Eeuo pipefail

root="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$root"

# ponytail: real host settings stay out of the public repo
[[ -f .deploy.env ]] && source ./.deploy.env

branch="${DEPLOY_BRANCH:-main}"
remote_host="${DEPLOY_HOST:-user@your-server}"
remote_path="${DEPLOY_PATH:-/srv/meal-planner}"
public_health_url="${DEPLOY_HEALTH_URL:-https://meals.example.com/api/health}"

for command_name in git npm ssh curl; do
  command -v "$command_name" >/dev/null 2>&1 || { echo "$command_name is required" >&2; exit 1; }
done

[[ "$(git branch --show-current)" == "$branch" ]] || {
  echo "Deployments must run from the $branch branch" >&2
  exit 1
}
[[ -z "$(git status --porcelain)" ]] || {
  echo "Commit or discard local changes before deploying" >&2
  exit 1
}

git fetch --prune origin "+refs/heads/$branch:refs/remotes/origin/$branch"
commit="$(git rev-parse HEAD)"
remote_commit="$(git rev-parse "origin/$branch")"
[[ "$commit" == "$remote_commit" ]] || {
  echo "Local $branch is not the exact commit on origin/$branch; push it before deploying" >&2
  exit 1
}

echo "Verifying $(git rev-parse --short=12 "$commit") before deployment"
npm ci
npm audit --omit=dev --audit-level=high

pocketbase_bin="${POCKETBASE_BIN:-}"
test_runtime=""
cleanup() {
  if [[ -n "$test_runtime" && -d "$test_runtime" ]]; then
    rm -rf -- "$test_runtime"
  fi
}
trap cleanup EXIT

if [[ -z "$pocketbase_bin" || ! -x "$pocketbase_bin" ]]; then
  command -v unzip >/dev/null 2>&1 || { echo "unzip is required" >&2; exit 1; }
  case "$(uname -m)" in
    x86_64) pocketbase_arch="amd64" ;;
    aarch64) pocketbase_arch="arm64" ;;
    armv7l) pocketbase_arch="armv7" ;;
    *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
  esac
  test_runtime="$(mktemp -d)"
  curl --fail --silent --show-error --location \
    --output "$test_runtime/pocketbase.zip" \
    "https://github.com/pocketbase/pocketbase/releases/download/v0.39.10/pocketbase_0.39.10_linux_${pocketbase_arch}.zip"
  unzip -q "$test_runtime/pocketbase.zip" pocketbase -d "$test_runtime"
  pocketbase_bin="$test_runtime/pocketbase"
fi

POCKETBASE_BIN="$pocketbase_bin" npm test
npm run build

ssh "$remote_host" bash -s -- "$remote_path" "$branch" "$commit" <<'REMOTE'
set -Eeuo pipefail
repo="$1"
branch="$2"
expected_commit="$3"

cd "$repo"
[[ -z "$(git status --porcelain)" ]] || {
  echo "Production checkout has local changes; refusing to deploy" >&2
  exit 1
}

git fetch --prune origin "+refs/heads/$branch:refs/remotes/origin/$branch"
if git show-ref --verify --quiet "refs/heads/$branch"; then
  git switch "$branch"
else
  git switch --no-track -c "$branch" "$expected_commit"
fi
git merge --ff-only "origin/$branch"
git config remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*'
git branch --set-upstream-to="origin/$branch" "$branch"

actual_commit="$(git rev-parse HEAD)"
[[ "$actual_commit" == "$expected_commit" ]] || {
  echo "Production checkout did not resolve to the expected commit" >&2
  exit 1
}

./scripts/deploy-host.sh "$expected_commit"
REMOTE

curl --fail --silent --show-error --max-time 15 "$public_health_url" >/dev/null
echo "Public health check passed: $public_health_url"
echo "Deployed $(git rev-parse --short=12 "$commit") from $branch to $remote_host"
