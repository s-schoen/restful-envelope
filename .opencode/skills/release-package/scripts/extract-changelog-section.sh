#!/usr/bin/env bash

# Extracts one stable version section from Changesets-generated changelog input.
# Input: stable version argument and CHANGELOG.md on stdin. Output: the matching section on stdout;
# on failure, writes a diagnostic to stderr and exits nonzero.

set -euo pipefail

fail() {
  printf 'extract-changelog-section: %s\n' "$1" >&2
  exit 1
}

if (( $# != 1 )); then
  fail "Usage: extract-changelog-section.sh <stable-version>"
fi

readonly version="$1"
readonly stable_version_pattern='^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'
readonly heading="## $version"

if [[ ! "$version" =~ $stable_version_pattern ]]; then
  fail "Version $version is not a stable semantic version."
fi

declare -a section_lines=()
line=""
match_count=0
in_section=0
last_content_index=-1

while IFS= read -r line || [[ -n "$line" ]]; do
  line="${line%$'\r'}"

  if [[ "$line" == "$heading" ]]; then
    ((match_count += 1))
    if (( match_count > 1 )); then
      fail "CHANGELOG.md contains more than one $heading section."
    fi
    in_section=1
    section_lines=("$line")
    continue
  fi

  if [[ "$line" == "##" || "$line" == "## "* || "$line" == $'##\t'* ]]; then
    in_section=0
  fi

  if (( in_section == 1 )); then
    section_lines+=("$line")
    if [[ "$line" =~ [^[:space:]] ]]; then
      last_content_index=$((${#section_lines[@]} - 1))
    fi
  fi
done

if (( match_count == 0 )); then
  fail "CHANGELOG.md does not contain a $heading section."
fi
if (( last_content_index < 1 )); then
  fail "The $heading section is empty."
fi

for (( index = 0; index <= last_content_index; index += 1 )); do
  printf '%s\n' "${section_lines[$index]}"
done
