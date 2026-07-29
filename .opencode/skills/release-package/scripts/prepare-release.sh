#!/usr/bin/env bash

# Creates a validated Changesets release commit and opens its review PR from an isolated worktree.

set -euo pipefail

readonly script_directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
source "$script_directory/release-common.sh"

(( $# == 0 )) || release_fail "Usage: prepare-release.sh"

release_require_commands git gh jq pnpm mktemp
release_require_repository_root
gh auth status >/dev/null 2>&1 || release_fail "GitHub CLI authentication is not valid."
release_require_repository_identity

repository_root="$PWD"
readonly temporary_root='/tmp/opencode'
mkdir -p "$temporary_root"

release_log "Fetching origin/$RELEASE_BASE_BRANCH."
git fetch --quiet origin "$RELEASE_BASE_BRANCH" || release_fail "Could not fetch origin/$RELEASE_BASE_BRANCH."
base_sha="$(git rev-parse "origin/$RELEASE_BASE_BRANCH")" || release_fail "Could not resolve origin/$RELEASE_BASE_BRANCH."

temporary_directory="$(mktemp -d "$temporary_root/restful-envelope-release.XXXXXX")" || release_fail "Could not create a temporary release directory."
release_worktree="$temporary_directory/worktree"

cleanup() {
  if [[ -d "$release_worktree" ]]; then
    git -C "$repository_root" worktree remove --force "$release_worktree" >/dev/null 2>&1 || true
  fi
  rm -rf "$temporary_directory"
}
trap cleanup EXIT

release_log "Creating an isolated worktree at $base_sha."
git worktree add --quiet --detach "$release_worktree" "$base_sha" || release_fail "Could not create the release worktree."

cd "$release_worktree"
[[ -z "$(git status --porcelain)" ]] || release_fail "The release worktree is not clean."
[[ "$(git rev-parse HEAD)" == "$base_sha" ]] || release_fail "The release worktree is not at the expected base commit."

release_log "Installing dependencies and reading the Changesets plan."
pnpm install --frozen-lockfile >&2
changeset_status="$temporary_directory/changeset-status.json"
pnpm exec changeset status --output "$changeset_status" >&2
release_load_changeset_plan "$changeset_status"

candidate_branch="release/v$RELEASE_VERSION"
candidate_tag="v$RELEASE_VERSION"
release_remote_tag_exists "$candidate_tag" && release_fail "Remote tag $candidate_tag already exists."
release_github_release_exists "$candidate_tag" && release_fail "GitHub release $candidate_tag already exists."
release_require_unpublished_version "$RELEASE_VERSION"
release_require_version_newer_than_npm "$RELEASE_VERSION"

open_release_prs="$(gh pr list --state open --base "$RELEASE_BASE_BRANCH" --limit 100 --json number,headRefName,url)" || release_fail "Could not query open release PRs."
other_release_prs="$(jq -c --arg branch "$candidate_branch" '[.[] | select((.headRefName | startswith("release/v")) and .headRefName != $branch)]' <<< "$open_release_prs")"
if [[ "$(jq 'length' <<< "$other_release_prs")" != '0' ]]; then
  jq -r '.[] | "open release PR #\(.number): \(.url)"' <<< "$other_release_prs" >&2
  release_fail "Another open release PR already exists."
fi
matching_pr_count="$(jq --arg branch "$candidate_branch" '[.[] | select(.headRefName == $branch)] | length' <<< "$open_release_prs")"
(( matching_pr_count <= 1 )) || release_fail "More than one open PR uses $candidate_branch."

if release_remote_branch_exists "$candidate_branch"; then
  release_log "Validating existing remote branch $candidate_branch before resuming preparation."
  git fetch --quiet origin "$candidate_branch" || release_fail "Could not fetch $candidate_branch."
  release_commit="$(git rev-parse FETCH_HEAD)" || release_fail "Could not resolve $candidate_branch."
  read -r -a commit_and_parents <<< "$(git rev-list --parents -n 1 "$release_commit")"
  (( ${#commit_and_parents[@]} == 2 )) || release_fail "$candidate_branch must contain one non-merge release commit."
  [[ "${commit_and_parents[1]}" == "$base_sha" ]] || release_fail "$candidate_branch is not based directly on $base_sha."
  release_validate_commit_diff "$base_sha" "$release_commit" "${RELEASE_CHANGESET_IDS[@]}"
  existing_version="$(git show "$release_commit:package.json" | jq -er '.version | select(type == "string")')" || release_fail "Could not read package version from $candidate_branch."
  [[ "$existing_version" == "$RELEASE_VERSION" ]] || release_fail "$candidate_branch contains version $existing_version instead of $RELEASE_VERSION."
  git switch --quiet --detach "$release_commit"
  release_notes="$(release_extract_notes "$RELEASE_VERSION" "$release_commit")" || release_fail "Could not extract release notes from $candidate_branch."
  git diff --check "$base_sha" "$release_commit"
  release_log "Re-running the CI-equivalent verification for the existing release branch."
  pnpm verify >&2
else
  (( matching_pr_count == 0 )) || release_fail "Open release PR exists without remote branch $candidate_branch."
  release_log "Generating release v$RELEASE_VERSION."
  pnpm changeset:version >&2

  generated_version="$(jq -er '.version | select(type == "string")' package.json)" || release_fail "package.json has no version after Changesets versioning."
  [[ "$generated_version" == "$RELEASE_VERSION" ]] || release_fail "Generated package version $generated_version does not match planned version $RELEASE_VERSION."

  release_validate_worktree_diff "${RELEASE_CHANGESET_IDS[@]}"
  release_notes="$(bash "$script_directory/extract-changelog-section.sh" "$RELEASE_VERSION" < CHANGELOG.md)" || release_fail "Could not extract release notes for $RELEASE_VERSION."
  [[ -n "$release_notes" ]] || release_fail "Release notes are empty."

  git diff --check
  release_log "Running the CI-equivalent verification."
  pnpm verify >&2

  declare -a release_paths=(package.json CHANGELOG.md)
  for changeset_id in "${RELEASE_CHANGESET_IDS[@]}"; do
    release_paths+=(".changeset/$changeset_id.md")
  done

  git add -- "${release_paths[@]}"
  git diff --cached --check
  git diff --quiet || release_fail "Release files contain unstaged changes."
  [[ -z "$(git ls-files --others --exclude-standard)" ]] || release_fail "Release worktree contains unexpected untracked files."

  release_log "Committing and pushing $candidate_branch."
  git commit -m "release v$RELEASE_VERSION" >&2
  release_commit="$(git rev-parse HEAD)" || release_fail "Could not resolve the release commit."
  git push origin "HEAD:refs/heads/$candidate_branch" >&2
fi

[[ -n "$release_notes" ]] || release_fail "Release notes are empty."

pr_body="$temporary_directory/pr-body.md"
{
  printf 'Base SHA: `%s`\n\n' "$base_sha"
  printf '## Release notes\n\n%s\n\n' "$release_notes"
  printf '## Verification\n\n'
  printf -- '- `git diff --check`\n'
  printf -- '- `pnpm verify`\n'
} > "$pr_body"

if (( matching_pr_count == 0 )); then
  release_log "Opening the release PR."
  gh pr create \
    --base "$RELEASE_BASE_BRANCH" \
    --head "$candidate_branch" \
    --title "Release v$RELEASE_VERSION" \
    --body-file "$pr_body" >&2
else
  release_log "Using the existing open PR for $candidate_branch."
fi

pr_json="$(gh pr view "$candidate_branch" --json number,url,state,baseRefName,headRefName)" || release_fail "Could not read the created release PR."
jq -e --arg branch "$candidate_branch" --arg base "$RELEASE_BASE_BRANCH" '
  .state == "OPEN" and .headRefName == $branch and .baseRefName == $base
' <<< "$pr_json" >/dev/null || release_fail "The created release PR does not match the expected branch and base."

jq -n \
  --argjson pr "$(jq '.number' <<< "$pr_json")" \
  --arg url "$(jq -r '.url' <<< "$pr_json")" \
  --arg version "$RELEASE_VERSION" \
  --arg branch "$candidate_branch" \
  --arg baseSha "$base_sha" \
  --arg commit "$release_commit" \
  '{pr: $pr, url: $url, version: $version, branch: $branch, baseSha: $baseSha, commit: $commit, verification: "pnpm verify"}'
