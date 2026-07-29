#!/usr/bin/env bash

set -euo pipefail

readonly test_directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
source "$test_directory/release-common.sh"

test_fail() {
  printf 'release-common.test: %s\n' "$1" >&2
  exit 1
}

assert_success() {
  "$@" || test_fail "Expected success: $*"
}

assert_failure() {
  if "$@" >/dev/null 2>&1; then
    test_fail "Expected failure: $*"
  fi
}

assert_success release_is_stable_version '0.0.0'
assert_success release_is_stable_version '10.20.300'
assert_failure release_is_stable_version '01.2.3'
assert_failure release_is_stable_version '1.2.3-beta.1'
assert_success release_is_strictly_newer '0.10.0' '0.9.99'
assert_success release_is_strictly_newer '10.0.0' '9.999.999'
assert_failure release_is_strictly_newer '1.2.3' '1.2.3'
assert_failure release_is_strictly_newer '1.2.2' '1.2.3'

temporary_directory="$(mktemp -d)"
trap 'rm -rf "$temporary_directory"' EXIT

valid_plan="$temporary_directory/valid-plan.json"
printf '%s\n' '{"changesets":[{"id":"calm-bees-unite","releases":[{"name":"@s-schoen/restful-envelope","type":"minor"}]}],"releases":[{"name":"@s-schoen/restful-envelope","type":"minor","oldVersion":"0.1.0","changesets":["calm-bees-unite"],"newVersion":"0.2.0"}]}' > "$valid_plan"
release_load_changeset_plan "$valid_plan"
[[ "$RELEASE_VERSION" == '0.2.0' ]] || test_fail "Expected candidate version 0.2.0."
[[ "${RELEASE_CHANGESET_IDS[*]}" == 'calm-bees-unite' ]] || test_fail "Expected one Changeset ID."

invalid_plan="$temporary_directory/invalid-plan.json"
printf '%s\n' '{"changesets":[],"releases":[]}' > "$invalid_plan"
assert_failure bash -c 'source "$1/release-common.sh"; release_load_changeset_plan "$2"' _ "$test_directory" "$invalid_plan"

repository="$temporary_directory/repository"
mkdir "$repository"
git -C "$repository" init --quiet
git -C "$repository" config user.email 'release-test@example.com'
git -C "$repository" config user.name 'Release Test'
mkdir "$repository/.changeset"
printf '%s\n' '{"name":"@s-schoen/restful-envelope","version":"0.1.0"}' > "$repository/package.json"
printf '%s\n' '---' > "$repository/.changeset/calm-bees-unite.md"
git -C "$repository" add package.json .changeset/calm-bees-unite.md
git -C "$repository" commit --quiet -m initial

printf '%s\n' '{"name":"@s-schoen/restful-envelope","version":"0.2.0"}' > "$repository/package.json"
printf '%s\n' '## 0.2.0' '' '- change' > "$repository/CHANGELOG.md"
rm "$repository/.changeset/calm-bees-unite.md"
assert_success bash -c 'source "$1/release-common.sh"; cd "$2"; release_validate_worktree_diff calm-bees-unite' _ "$test_directory" "$repository"

printf '%s\n' 'unexpected' > "$repository/unexpected.txt"
assert_failure bash -c 'source "$1/release-common.sh"; cd "$2"; release_validate_worktree_diff calm-bees-unite' _ "$test_directory" "$repository"

printf 'release-common.test: all tests passed\n'
