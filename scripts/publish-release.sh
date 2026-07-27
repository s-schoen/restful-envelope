#!/usr/bin/env bash

# Publishes the only .tgz in the supplied artifact directory as the public npm latest release.
# Input: artifact directory argument. Output: pnpm publish output and exit status. This script's
# successful side effect is an immutable npm package version with provenance.

set -euo pipefail

fail() {
  printf '::error::%s\n' "$1" >&2
  exit 1
}

if (( $# != 1 )); then
  fail "Usage: $0 <artifact-directory>"
fi

readonly artifact_directory="$1"

shopt -s nullglob
tarballs=("$artifact_directory"/*.tgz)
if (( ${#tarballs[@]} != 1 )); then
  fail "Expected exactly one release tarball."
fi

exec pnpm publish "${tarballs[0]}" --access public --tag latest --provenance --no-git-checks
