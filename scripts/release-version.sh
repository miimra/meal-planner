#!/usr/bin/env bash
set -Eeuo pipefail

commit="${1:-}"
[[ "$commit" =~ ^[0-9a-f]{40}$ ]] || {
  echo "A full 40-character commit SHA is required to derive a release version" >&2
  exit 1
}

release_tag="$(git describe --tags --match 'v[0-9]*' --abbrev=0 "$commit" 2>/dev/null)" || {
  echo "No reachable release tag anchors commit $commit; publish a vX.Y.Z tag before deploying" >&2
  exit 1
}
[[ "$release_tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || {
  echo "Nearest release tag '$release_tag' must use the vX.Y.Z format" >&2
  exit 1
}

anchor_commit="$(git rev-list -n 1 "$release_tag")"
git merge-base --is-ancestor "$anchor_commit" "$commit" || {
  echo "Release tag $release_tag is not reachable from $commit" >&2
  exit 1
}

distance="$(git rev-list --count "$anchor_commit..$commit")"
version="${release_tag#v}"
if [[ "$distance" != "0" ]]; then
  version+="+$distance.$(git rev-parse --short=12 "$commit")"
fi

printf '%s\n' "$version"
