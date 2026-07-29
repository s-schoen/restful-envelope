#!/usr/bin/env bash

set -euo pipefail

readonly test_directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
readonly temporary_directory="$(mktemp -d)"
trap 'rm -rf "$temporary_directory"' EXIT

test_fail() {
  printf 'prepare-release.test: %s\n' "$1" >&2
  exit 1
}

gh() {
  printf '%s\n' "$*" >> "$PREPARE_GH_LOG"

  case "$1 $2" in
    'auth status')
      return 0
      ;;
    'repo view')
      printf 's-schoen/restful-envelope\n'
      ;;
    'pr list')
      if [[ -f "$PREPARE_PR_STATE" ]]; then
        printf '[{"number":7,"headRefName":"release/v0.2.0","url":"https://github.com/example/repository/pull/7"}]\n'
      else
        printf '[]\n'
      fi
      ;;
    'release list')
      printf '[]\n'
      ;;
    'pr create')
      printf 'created\n' > "$PREPARE_PR_STATE"
      ;;
    'pr view')
      [[ -f "$PREPARE_PR_STATE" ]] || return 1
      printf '{"number":7,"url":"https://github.com/example/repository/pull/7","state":"OPEN","baseRefName":"master","headRefName":"release/v0.2.0"}\n'
      ;;
    *)
      printf 'Unexpected gh invocation: %s\n' "$*" >&2
      return 1
      ;;
  esac
}

git() {
  if [[ "${1:-} ${2:-} ${3:-}" == 'remote get-url origin' ]]; then
    printf 'git@github.com:s-schoen/restful-envelope.git\n'
  else
    command git "$@"
  fi
}

pnpm() {
  case "$1" in
    install | verify)
      return 0
      ;;
    exec)
      [[ "$2 $3 $4" == 'changeset status --output' ]] || {
        printf 'Unexpected pnpm invocation: %s\n' "$*" >&2
        return 1
      }
      printf '%s\n' '{"changesets":[{"id":"calm-bees-unite","releases":[{"name":"@s-schoen/restful-envelope","type":"minor"}]}],"releases":[{"name":"@s-schoen/restful-envelope","type":"minor","oldVersion":"0.1.0","changesets":["calm-bees-unite"],"newVersion":"0.2.0"}]}' > "$5"
      ;;
    changeset:version)
      printf '%s\n' '{"name":"@s-schoen/restful-envelope","version":"0.2.0"}' > package.json
      printf '%s\n' '# Changelog' '' '## 0.2.0' '' '### Minor Changes' '' '- Add shared schemas.' > CHANGELOG.md
      rm .changeset/calm-bees-unite.md
      ;;
    view)
      case "$2 $3" in
        '@s-schoen/restful-envelope dist-tags.latest') printf '0.1.0\n' ;;
        '@s-schoen/restful-envelope versions') printf '["0.1.0"]\n' ;;
        *)
          printf 'Unexpected pnpm invocation: %s\n' "$*" >&2
          return 1
          ;;
      esac
      ;;
    *)
      printf 'Unexpected pnpm invocation: %s\n' "$*" >&2
      return 1
      ;;
  esac
}

export -f gh git pnpm
export PREPARE_GH_LOG="$temporary_directory/gh.log"
export PREPARE_PR_STATE="$temporary_directory/pr-created"

bare_repository="$temporary_directory/origin.git"
working_repository="$temporary_directory/repository"
git init --quiet --bare "$bare_repository"
git init --quiet "$working_repository"
git -C "$working_repository" config user.email 'release-test@example.com'
git -C "$working_repository" config user.name 'Release Test'
git -C "$working_repository" checkout --quiet -b master
mkdir "$working_repository/.changeset"
printf '%s\n' '{"name":"@s-schoen/restful-envelope","version":"0.1.0"}' > "$working_repository/package.json"
printf '%s\n' '---' > "$working_repository/.changeset/calm-bees-unite.md"
git -C "$working_repository" add package.json .changeset/calm-bees-unite.md
git -C "$working_repository" commit --quiet -m initial
git -C "$working_repository" remote add origin "$bare_repository"
git -C "$working_repository" push --quiet -u origin master
printf '%s\n' 'leave untouched' > "$working_repository/user-work.txt"

prepare_output="$(cd "$working_repository" && bash "$test_directory/prepare-release.sh")"
jq -e '
  .pr == 7 and
  .version == "0.2.0" and
  .branch == "release/v0.2.0" and
  .url == "https://github.com/example/repository/pull/7"
' <<< "$prepare_output" >/dev/null || test_fail "Prepare result output is invalid."

resumed_output="$(cd "$working_repository" && bash "$test_directory/prepare-release.sh")"
jq -e '.pr == 7 and .commit != ""' <<< "$resumed_output" >/dev/null || test_fail "Resumed prepare result output is invalid."

git --git-dir="$bare_repository" show refs/heads/release/v0.2.0:package.json |
  jq -e '.version == "0.2.0"' >/dev/null || test_fail "Release branch has the wrong package version."
if git --git-dir="$bare_repository" cat-file -e refs/heads/release/v0.2.0:.changeset/calm-bees-unite.md 2>/dev/null; then
  test_fail "Release branch still contains the consumed Changeset."
fi
[[ "$(jq -r '.version' "$working_repository/package.json")" == '0.1.0' ]] || test_fail "The original checkout was modified."
[[ -f "$working_repository/user-work.txt" ]] || test_fail "The user's untracked file was removed."

release_create_count="$(grep -c '^pr create ' "$PREPARE_GH_LOG")"
[[ "$release_create_count" == '1' ]] || test_fail "Expected exactly one release PR creation."

printf 'prepare-release.test: all tests passed\n'
