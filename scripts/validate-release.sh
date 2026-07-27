#!/usr/bin/env bash

# Validates the release event, checked-in package metadata, release notes, and master ancestry.
# Inputs: package.json and git state plus GITHUB_EVENT_PATH and GITHUB_OUTPUT. Output: appends the
# validated package name and version to GITHUB_OUTPUT; failures emit a GitHub error annotation.

set -euo pipefail

fail() {
  printf '::error::%s\n' "$1" >&2
  exit 1
}

readonly event_path="${GITHUB_EVENT_PATH:?GITHUB_EVENT_PATH must be set}"
readonly output_path="${GITHUB_OUTPUT:?GITHUB_OUTPUT must be set}"
readonly expected_package_name='@s-schoen/restful-envelope'
readonly stable_version_pattern='^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'

package_name=""
if ! package_name="$(jq -er '.name | select(type == "string" and length > 0)' package.json)"; then
  fail "package.json must contain a package name."
fi

package_version=""
if ! package_version="$(jq -er '.version | select(type == "string")' package.json)"; then
  fail "package.json must contain a package version."
fi

release_tag=""
if ! release_tag="$(jq -er '.release.tag_name | select(type == "string")' "$event_path")"; then
  fail "The GitHub release must contain a tag."
fi

if [[ "$package_name" != "$expected_package_name" ]]; then
  fail "Package name $package_name does not match $expected_package_name."
fi
if [[ ! "$package_version" =~ $stable_version_pattern ]]; then
  fail "Package version $package_version is not a stable semantic version."
fi
if [[ "$release_tag" != "v$package_version" ]]; then
  fail "Release tag $release_tag does not match package version $package_version."
fi
if ! jq -e '.release.body | (type == "string" and test("\\S"))' "$event_path" >/dev/null; then
  fail "The GitHub release must contain release notes."
fi
if ! git merge-base --is-ancestor HEAD origin/master; then
  fail "The release commit is not contained in master."
fi

printf 'name=%s\nversion=%s\n' "$package_name" "$package_version" >> "$output_path"
