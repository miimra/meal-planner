#!/usr/bin/env bash
# Pull-based deploy, run every 5 minutes by meal-planner-autodeploy.timer as the
# checkout owner in /srv/meal-planner. When origin/main moves, it fast-forwards
# the checkout and runs scripts/deploy-host.sh, which backs up PocketBase,
# builds, health-checks and restores the previous image on failure. This script
# also puts the checkout back on the previous commit so it matches what runs.
# Output goes to the journal: journalctl -u meal-planner-autodeploy.
set -u

DIR="${AUTODEPLOY_DIR:-/srv/meal-planner}"
BRANCH="${AUTODEPLOY_BRANCH:-main}"
LOCK="${AUTODEPLOY_LOCK:-/tmp/meal-planner-autodeploy.lock}"

log() { echo "autodeploy: $*"; }

# Everything is inside main, which bash parses completely before running it:
# the merge and the rollback replace this file while it runs.
main() {
  exec 9>"$LOCK"
  flock -n 9 || { log "another run is in progress, stopping"; exit 0; }

  cd "$DIR" || { log "no checkout at $DIR"; exit 1; }
  git fetch --quiet --prune --tags origin "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH" \
    || { log "git fetch failed"; exit 1; }

  prev=$(git rev-parse HEAD) || exit 1
  new=$(git rev-parse "origin/$BRANCH") || exit 1
  if [ "$new" = "$prev" ]; then
    log "up to date at ${prev:0:12}"
    exit 0
  fi
  # A commit that already failed is not retried every tick; a newer commit is.
  if [ -f .git/autodeploy-failed ] && [ "$(cat .git/autodeploy-failed)" = "$new" ]; then
    log "${new:0:12} already failed and was rolled back, waiting for a newer commit"
    exit 0
  fi
  if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    log "not deploying ${new:0:12}: the checkout has local changes"
    exit 1
  fi
  if ! git merge-base --is-ancestor "$prev" "$new"; then
    log "not deploying ${new:0:12}: HEAD ${prev:0:12} is not an ancestor of origin/$BRANCH"
    exit 1
  fi

  log "deploying ${prev:0:12} -> ${new:0:12}"
  git merge --quiet --ff-only "$new" || { log "fast-forward failed"; exit 1; }

  version=$(scripts/release-version.sh "$new") && built_at=$(date -u +%Y-%m-%dT%H:%M:%SZ) \
    && scripts/deploy-host.sh "$new" "$version" "$built_at"
  status=$?
  if [ "$status" -eq 0 ]; then
    rm -f .git/autodeploy-failed
    log "deployed ${new:0:12} as $version"
    exit 0
  fi

  log "deploy of ${new:0:12} failed (exit $status); checkout back to ${prev:0:12}"
  git reset --quiet --hard "$prev" || log "checkout rollback failed"
  echo "$new" > .git/autodeploy-failed
  exit 1
}
main
exit $?
