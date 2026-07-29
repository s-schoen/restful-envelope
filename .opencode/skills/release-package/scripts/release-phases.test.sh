#!/usr/bin/env bash

set -euo pipefail

readonly test_directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
readonly temporary_directory="$(mktemp -d)"
trap 'rm -rf "$temporary_directory"' EXIT

test_fail() {
  printf 'release-phases.test: %s\n' "$1" >&2
  exit 1
}

gh() {
  printf '%s\n' "$*" >> "$GH_LOG"

  case "$1 $2" in
    'auth status')
      return 0
      ;;
    'repo view')
      printf 's-schoen/restful-envelope\n'
      ;;
    'pr view')
      printf '{"number":4,"state":"MERGED","mergedAt":"2026-07-28T17:00:00Z","baseRefName":"master","headRefName":"release/v0.2.0","mergeCommit":{"oid":"%s"},"url":"https://github.com/example/repository/pull/4","title":"Release v0.2.0","reviewDecision":"APPROVED","statusCheckRollup":[{"__typename":"CheckRun","status":"COMPLETED","conclusion":"%s"}]}\n' "$TARGET_SHA" "$PR_CHECK_CONCLUSION"
      ;;
    'pr diff')
      printf '%s\n' package.json CHANGELOG.md .changeset/calm-bees-unite.md
      ;;
    'release list')
      if [[ -f "$GH_STATE" ]]; then
        printf '[{"tagName":"v0.2.0"}]\n'
      else
        printf '[]\n'
      fi
      ;;
    'release create')
      printf 'created\n' > "$GH_STATE"
      ;;
    'release view')
      [[ -f "$GH_STATE" ]] || return 1
      printf '{"tagName":"v0.2.0","targetCommitish":"%s","url":"https://github.com/example/repository/releases/tag/v0.2.0","isDraft":false,"isPrerelease":false,"publishedAt":"2026-07-28T18:00:00Z"}\n' "$TARGET_SHA"
      ;;
    'run list')
      if [[ -f "$GH_STATE" ]]; then
        printf '[{"databaseId":123,"status":"completed","conclusion":"success","headBranch":"v0.2.0","headSha":"%s","url":"https://github.com/example/repository/actions/runs/123","createdAt":"2026-07-28T18:00:01Z"}]\n' "$TARGET_SHA"
      else
        printf '[]\n'
      fi
      ;;
    'run watch')
      return 0
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
  [[ "$1" == 'view' ]] || {
    printf 'Unexpected pnpm invocation: %s\n' "$*" >&2
    return 1
  }

  case "$2 $3" in
    '@s-schoen/restful-envelope dist-tags.latest')
      if [[ -f "$GH_STATE" ]]; then
        printf '0.2.0\n'
      else
        printf '0.1.0\n'
      fi
      ;;
    '@s-schoen/restful-envelope@0.2.0 version')
      printf '0.2.0\n'
      ;;
    '@s-schoen/restful-envelope@0.2.0 dist.attestations.provenance.predicateType')
      printf 'https://slsa.dev/provenance/v1\n'
      ;;
    '@s-schoen/restful-envelope@0.2.0 dist.attestations.url')
      printf 'https://registry.npmjs.org/-/npm/v1/attestations/example\n'
      ;;
    '@s-schoen/restful-envelope versions')
      printf '["0.1.0"]\n'
      ;;
    *)
      printf 'Unexpected pnpm invocation: %s\n' "$*" >&2
      return 1
      ;;
  esac
}

export -f gh git pnpm
export GH_LOG="$temporary_directory/gh.log"
export GH_STATE="$temporary_directory/release-created"
export PR_CHECK_CONCLUSION='SUCCESS'

bare_repository="$temporary_directory/origin.git"
working_repository="$temporary_directory/repository"
git init --quiet --bare "$bare_repository"
git init --quiet "$working_repository"
git -C "$working_repository" config user.email 'release-test@example.com'
git -C "$working_repository" config user.name 'Release Test'
git -C "$working_repository" checkout --quiet -b master
printf '%s\n' '{"name":"@s-schoen/restful-envelope","version":"0.2.0"}' > "$working_repository/package.json"
printf '%s\n' '# Changelog' '' '## 0.2.0' '' '### Minor Changes' '' '- Add shared schemas.' > "$working_repository/CHANGELOG.md"
git -C "$working_repository" add package.json CHANGELOG.md
git -C "$working_repository" commit --quiet -m 'release v0.2.0'
git -C "$working_repository" remote add origin "$bare_repository"
git -C "$working_repository" push --quiet -u origin master
export TARGET_SHA="$(git -C "$working_repository" rev-parse HEAD)"

plan_output="$(cd "$working_repository" && bash "$test_directory/plan-publication.sh" 4)"
jq -e \
  --arg target "$TARGET_SHA" '
    .pr == 4 and
    .version == "0.2.0" and
    .target == $target and
    .tag == "v0.2.0" and
    (.notes | contains("Add shared schemas."))
  ' <<< "$plan_output" >/dev/null || test_fail "Publication plan output is invalid."

PR_CHECK_CONCLUSION='FAILURE'
if failed_check_output="$(cd "$working_repository" && bash "$test_directory/plan-publication.sh" 4 2>&1)"; then
  test_fail "Publication planning accepted failed CI."
fi
[[ "$failed_check_output" == *'does not have completed successful CI checks'* ]] || test_fail "Failed CI diagnostic is missing."
PR_CHECK_CONCLUSION='SUCCESS'

set +e
absent_output="$(cd "$working_repository" && bash "$test_directory/verify-publication.sh" 4 "$TARGET_SHA")"
absent_status=$?
set -e
(( absent_status != 0 )) || test_fail "Verification accepted an absent GitHub release."
jq -e '.status == "release-absent" and .npmPublished == false' <<< "$absent_output" >/dev/null || test_fail "Absent release result is invalid."

publish_output="$(cd "$working_repository" && bash "$test_directory/publish-release.sh" 4 "$TARGET_SHA")"
jq -e \
  --arg target "$TARGET_SHA" '
    .status == "published" and
    .pr == 4 and
    .version == "0.2.0" and
    .target == $target and
    .workflow == 123
  ' <<< "$publish_output" >/dev/null || test_fail "Publication result output is invalid."

release_create_count="$(grep -c '^release create ' "$GH_LOG")"
[[ "$release_create_count" == '1' ]] || test_fail "Expected exactly one GitHub release creation."
grep -F -- "--target $TARGET_SHA" "$GH_LOG" >/dev/null || test_fail "Release creation did not use the approved target."

printf 'release-phases.test: all tests passed\n'
