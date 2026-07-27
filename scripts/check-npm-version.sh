#!/usr/bin/env bash

# Confirms that a candidate stable version is strictly newer than the package's npm latest version.
# Inputs: package name and candidate version arguments. Output: none on success; on failure, writes
# a GitHub error annotation to stderr and exits nonzero. Reads npm metadata through pnpm.

set -euo pipefail

export LC_ALL=C

fail() {
  printf '::error::%s\n' "$1" >&2
  exit 1
}

is_strictly_newer() {
  local left_version="$1"
  local right_version="$2"
  local -a left_parts right_parts
  local index left_part right_part

  IFS=. read -r -a left_parts <<< "$left_version"
  IFS=. read -r -a right_parts <<< "$right_version"

  for index in 0 1 2; do
    left_part="${left_parts[$index]}"
    right_part="${right_parts[$index]}"

    if (( ${#left_part} > ${#right_part} )); then
      return 0
    fi
    if (( ${#left_part} < ${#right_part} )); then
      return 1
    fi
    if [[ "$left_part" > "$right_part" ]]; then
      return 0
    fi
    if [[ "$left_part" < "$right_part" ]]; then
      return 1
    fi
  done

  return 1
}

if (( $# != 2 )); then
  fail "Usage: $0 <package-name> <candidate-version>"
fi

readonly package_name="$1"
readonly candidate_version="$2"
readonly stable_version_pattern='^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'

latest_version=""
if ! latest_version="$(pnpm view "$package_name" dist-tags.latest)"; then
  fail "Could not read npm latest for $package_name."
fi
readonly latest_version

if [[ ! "$candidate_version" =~ $stable_version_pattern ]]; then
  fail "Candidate version $candidate_version is not a stable semantic version."
fi
if [[ ! "$latest_version" =~ $stable_version_pattern ]]; then
  fail "npm latest version $latest_version is not a stable semantic version."
fi
if ! is_strictly_newer "$candidate_version" "$latest_version"; then
  fail "Package version $candidate_version must be newer than npm latest $latest_version."
fi
