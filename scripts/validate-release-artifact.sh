#!/usr/bin/env bash

# Verifies that one release tarball exists and that its manifest has the expected package identity.
# Inputs: artifact directory, package name, and package version arguments. Output: none on success;
# on failure, writes a GitHub error annotation to stderr and exits nonzero.

set -euo pipefail

fail() {
  printf '::error::%s\n' "$1" >&2
  exit 1
}

if (( $# != 3 )); then
  fail "Usage: $0 <artifact-directory> <package-name> <package-version>"
fi

readonly artifact_directory="$1"
readonly expected_name="$2"
readonly expected_version="$3"

shopt -s nullglob
tarballs=("$artifact_directory"/*.tgz)
if (( ${#tarballs[@]} != 1 )); then
  fail "Expected exactly one release tarball."
fi
readonly tarball="${tarballs[0]}"

packed_manifest=""
if ! packed_manifest="$(tar -xOf "$tarball" package/package.json)"; then
  fail "Could not read package.json from $tarball."
fi

packed_name=""
if ! packed_name="$(jq -er '.name | select(type == "string")' <<< "$packed_manifest")"; then
  fail "The packed package.json does not contain a package name."
fi

packed_version=""
if ! packed_version="$(jq -er '.version | select(type == "string")' <<< "$packed_manifest")"; then
  fail "The packed package.json does not contain a package version."
fi

if [[ "$packed_name" != "$expected_name" ]]; then
  fail "Packed name $packed_name does not match $expected_name."
fi
if [[ "$packed_version" != "$expected_version" ]]; then
  fail "Packed version $packed_version does not match $expected_version."
fi
