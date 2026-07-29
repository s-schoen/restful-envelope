#!/usr/bin/env bash

# Shared validation and query functions for the release-package skill scripts.

readonly RELEASE_PACKAGE_NAME='@s-schoen/restful-envelope'
readonly RELEASE_GITHUB_REPOSITORY='s-schoen/restful-envelope'
readonly RELEASE_BASE_BRANCH='master'
readonly RELEASE_WORKFLOW_NAME='Release'
readonly RELEASE_STABLE_VERSION_PATTERN='^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'
readonly RELEASE_FULL_SHA_PATTERN='^[0-9a-f]{40}$'
readonly RELEASE_SCRIPT_DIRECTORY="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"

release_fail() {
  printf 'release-package: %s\n' "$1" >&2
  exit 1
}

release_log() {
  printf 'release-package: %s\n' "$1" >&2
}

release_require_commands() {
  local command_name

  for command_name in "$@"; do
    command -v "$command_name" >/dev/null 2>&1 || release_fail "Required command $command_name is not available."
  done
}

release_repository_root() {
  local root

  root="$(git rev-parse --show-toplevel 2>/dev/null)" || release_fail "Run this command inside the repository."
  printf '%s\n' "$root"
}

release_require_repository_root() {
  local root

  root="$(release_repository_root)"
  [[ "$PWD" == "$root" ]] || release_fail "Run this command from the repository root: $root"
}

release_require_repository_identity() {
  local origin_url github_repository

  origin_url="$(git remote get-url origin)" || release_fail "Repository has no origin remote."
  case "$origin_url" in
    "git@github.com:$RELEASE_GITHUB_REPOSITORY.git" | \
      "https://github.com/$RELEASE_GITHUB_REPOSITORY" | \
      "https://github.com/$RELEASE_GITHUB_REPOSITORY.git" | \
      "ssh://git@github.com/$RELEASE_GITHUB_REPOSITORY" | \
      "ssh://git@github.com/$RELEASE_GITHUB_REPOSITORY.git") ;;
    *) release_fail "origin $origin_url is not the expected GitHub repository $RELEASE_GITHUB_REPOSITORY." ;;
  esac

  github_repository="$(gh repo view --json nameWithOwner --jq '.nameWithOwner')" || release_fail "Could not resolve the GitHub repository."
  [[ "$github_repository" == "$RELEASE_GITHUB_REPOSITORY" ]] || release_fail "GitHub CLI resolved $github_repository instead of $RELEASE_GITHUB_REPOSITORY."
}

release_is_stable_version() {
  [[ "$1" =~ $RELEASE_STABLE_VERSION_PATTERN ]]
}

release_is_strictly_newer() {
  local candidate="$1"
  local current="$2"
  local -a candidate_parts current_parts
  local index candidate_part current_part

  release_is_stable_version "$candidate" || return 1
  release_is_stable_version "$current" || return 1

  IFS=. read -r -a candidate_parts <<< "$candidate"
  IFS=. read -r -a current_parts <<< "$current"

  for index in 0 1 2; do
    candidate_part="${candidate_parts[$index]}"
    current_part="${current_parts[$index]}"

    if (( ${#candidate_part} > ${#current_part} )); then
      return 0
    fi
    if (( ${#candidate_part} < ${#current_part} )); then
      return 1
    fi
    if [[ "$candidate_part" > "$current_part" ]]; then
      return 0
    fi
    if [[ "$candidate_part" < "$current_part" ]]; then
      return 1
    fi
  done

  return 1
}

release_load_changeset_plan() {
  local status_path="$1"
  local plan_valid

  plan_valid="$(
    jq -er --arg package "$RELEASE_PACKAGE_NAME" '
      (.releases | type == "array" and length == 1) and
      (.releases[0].name == $package) and
      (.releases[0].newVersion | type == "string") and
      (.changesets | type == "array" and length > 0) and
      all(.changesets[];
        (.id | type == "string" and test("^[a-z0-9-]+$")) and
        (.releases | type == "array" and length == 1) and
        (.releases[0].name == $package)
      )
    ' "$status_path"
  )" || release_fail "Changesets must plan exactly one nonempty release for $RELEASE_PACKAGE_NAME."
  [[ "$plan_valid" == 'true' ]] || release_fail "Changesets must plan exactly one nonempty release for $RELEASE_PACKAGE_NAME."

  RELEASE_VERSION="$(jq -er '.releases[0].newVersion' "$status_path")"
  release_is_stable_version "$RELEASE_VERSION" || release_fail "Candidate version $RELEASE_VERSION is not a stable semantic version."

  mapfile -t RELEASE_CHANGESET_IDS < <(jq -er '.changesets[].id' "$status_path")
  (( ${#RELEASE_CHANGESET_IDS[@]} > 0 )) || release_fail "The release plan contains no Changesets."
}

release_validate_worktree_diff() {
  local -A expected_changesets=()
  local -A seen_changesets=()
  local changeset_id entry status path
  local package_seen=0
  local changelog_seen=0

  for changeset_id in "$@"; do
    expected_changesets[".changeset/$changeset_id.md"]=1
  done

  while IFS= read -r -d '' entry; do
    status="${entry:0:2}"
    path="${entry:3}"

    case "$path" in
      package.json)
        [[ "$status" == ' M' ]] || release_fail "package.json has unexpected Git status $status."
        package_seen=1
        ;;
      CHANGELOG.md)
        [[ "$status" == ' M' || "$status" == '??' ]] || release_fail "CHANGELOG.md has unexpected Git status $status."
        changelog_seen=1
        ;;
      .changeset/*.md)
        [[ -n "${expected_changesets[$path]:-}" ]] || release_fail "Unexpected Changeset path $path was modified."
        [[ "$status" == ' D' ]] || release_fail "$path has unexpected Git status $status."
        seen_changesets["$path"]=1
        ;;
      *)
        release_fail "Release versioning modified unexpected path $path."
        ;;
    esac
  done < <(git status --porcelain=v1 -z --untracked-files=all)

  (( package_seen == 1 )) || release_fail "Release versioning did not modify package.json."
  (( changelog_seen == 1 )) || release_fail "Release versioning did not modify CHANGELOG.md."

  for path in "${!expected_changesets[@]}"; do
    [[ -n "${seen_changesets[$path]:-}" ]] || release_fail "Release versioning did not consume $path."
  done
}

release_validate_commit_diff() {
  local base="$1"
  local commit="$2"
  shift 2
  local -A expected_changesets=()
  local -A seen_changesets=()
  local changeset_id status path
  local package_seen=0
  local changelog_seen=0

  for changeset_id in "$@"; do
    expected_changesets[".changeset/$changeset_id.md"]=1
  done

  while IFS=$'\t' read -r status path; do
    [[ -n "$path" ]] || continue
    case "$path" in
      package.json)
        [[ "$status" == 'M' ]] || release_fail "package.json has unexpected committed status $status."
        package_seen=1
        ;;
      CHANGELOG.md)
        [[ "$status" == 'M' || "$status" == 'A' ]] || release_fail "CHANGELOG.md has unexpected committed status $status."
        changelog_seen=1
        ;;
      .changeset/*.md)
        [[ -n "${expected_changesets[$path]:-}" ]] || release_fail "Commit contains unexpected Changeset path $path."
        [[ "$status" == 'D' ]] || release_fail "$path has unexpected committed status $status."
        seen_changesets["$path"]=1
        ;;
      *) release_fail "Release commit contains unexpected path $path." ;;
    esac
  done < <(git diff --name-status --no-renames "$base" "$commit")

  (( package_seen == 1 )) || release_fail "Release commit does not modify package.json."
  (( changelog_seen == 1 )) || release_fail "Release commit does not modify CHANGELOG.md."
  for path in "${!expected_changesets[@]}"; do
    [[ -n "${seen_changesets[$path]:-}" ]] || release_fail "Release commit does not consume $path."
  done
}

release_npm_latest() {
  local latest

  latest="$(pnpm view "$RELEASE_PACKAGE_NAME" dist-tags.latest)" || release_fail "Could not read npm latest for $RELEASE_PACKAGE_NAME."
  release_is_stable_version "$latest" || release_fail "npm latest version $latest is not a stable semantic version."
  printf '%s\n' "$latest"
}

release_require_version_newer_than_npm() {
  local version="$1"
  local latest

  latest="$(release_npm_latest)"
  release_is_strictly_newer "$version" "$latest" || release_fail "Package version $version must be newer than npm latest $latest."
}

release_npm_has_version() {
  local version="$1"
  local state

  state="$(release_npm_version_state "$version")"
  case "$state" in
    true) return 0 ;;
    false) return 1 ;;
    unknown) release_fail "Could not read npm versions for $RELEASE_PACKAGE_NAME." ;;
    *) release_fail "Unexpected npm version state $state." ;;
  esac
}

release_npm_version_state() {
  local version="$1"
  local versions

  if ! versions="$(pnpm view "$RELEASE_PACKAGE_NAME" versions --json 2>/dev/null)"; then
    printf 'unknown\n'
    return 0
  fi
  if jq -e --arg version "$version" '
    if type == "array" then index($version) != null else . == $version end
  ' <<< "$versions" >/dev/null; then
    printf 'true\n'
  else
    printf 'false\n'
  fi
}

release_require_unpublished_version() {
  if release_npm_has_version "$1"; then
    release_fail "npm already contains immutable version $1."
  fi
}

release_remote_branch_exists() {
  local branch="$1"
  local output status

  if output="$(git ls-remote --exit-code --heads origin "refs/heads/$branch" 2>&1)"; then
    return 0
  else
    status=$?
  fi

  (( status == 2 )) && return 1
  release_fail "Could not query remote branch $branch: $output"
}

release_remote_tag_exists() {
  local tag="$1"
  local output status

  if output="$(git ls-remote --exit-code --tags origin "refs/tags/$tag" 2>&1)"; then
    return 0
  else
    status=$?
  fi

  (( status == 2 )) && return 1
  release_fail "Could not query remote tag $tag: $output"
}

release_github_release_exists() {
  local tag="$1"
  local releases

  releases="$(gh release list --limit 1000 --json tagName)" || release_fail "Could not query GitHub releases."
  jq -e --arg tag "$tag" 'any(.[]; .tagName == $tag)' <<< "$releases" >/dev/null
}

release_require_no_active_workflows() {
  local runs

  runs="$(gh run list --workflow "$RELEASE_WORKFLOW_NAME" --limit 100 --json databaseId,status,url)" || release_fail "Could not query $RELEASE_WORKFLOW_NAME workflow runs."
  if ! jq -e 'all(.[]; .status == "completed")' <<< "$runs" >/dev/null; then
    jq -r '.[] | select(.status != "completed") | "active workflow \(.databaseId): \(.status) \(.url)"' <<< "$runs" >&2
    release_fail "A previous $RELEASE_WORKFLOW_NAME workflow is still active."
  fi
}

release_extract_notes() {
  local version="$1"
  local target="$2"

  git show "$target:CHANGELOG.md" |
    bash "$RELEASE_SCRIPT_DIRECTORY/extract-changelog-section.sh" "$version"
}

release_validate_pr_number() {
  [[ "$1" =~ ^[1-9][0-9]*$ ]] || release_fail "PR number must be a positive integer."
}

release_validate_target() {
  [[ "$1" =~ $RELEASE_FULL_SHA_PATTERN ]] || release_fail "Release target must be a full 40-character Git SHA."
}

release_load_merged_release_pr() {
  local pr_number="$1"
  local pr_json changed_paths path package_seen changelog_seen

  release_validate_pr_number "$pr_number"
  pr_json="$(gh pr view "$pr_number" --json number,state,mergedAt,baseRefName,headRefName,mergeCommit,url,title,reviewDecision,statusCheckRollup)" || release_fail "Could not read PR #$pr_number."

  [[ "$(jq -r '.state' <<< "$pr_json")" == 'MERGED' ]] || release_fail "PR #$pr_number is not merged."
  [[ "$(jq -r '.baseRefName' <<< "$pr_json")" == "$RELEASE_BASE_BRANCH" ]] || release_fail "PR #$pr_number was not merged into $RELEASE_BASE_BRANCH."
  [[ "$(jq -r '.reviewDecision // ""' <<< "$pr_json")" != 'CHANGES_REQUESTED' ]] || release_fail "PR #$pr_number was merged with requested changes."
  jq -e '
    (.statusCheckRollup | type == "array" and length > 0) and
    all(.statusCheckRollup[];
      if .__typename == "CheckRun" then
        .status == "COMPLETED" and
        (.conclusion as $conclusion | ["SUCCESS", "NEUTRAL", "SKIPPED"] | index($conclusion) != null)
      elif .__typename == "StatusContext" then
        .state == "SUCCESS"
      else
        false
      end
    )
  ' <<< "$pr_json" >/dev/null || release_fail "PR #$pr_number does not have completed successful CI checks."

  RELEASE_BRANCH="$(jq -r '.headRefName' <<< "$pr_json")"
  [[ "$RELEASE_BRANCH" =~ ^release/v(.+)$ ]] || release_fail "PR #$pr_number does not use a release/v<version> branch."
  RELEASE_VERSION="${BASH_REMATCH[1]}"
  release_is_stable_version "$RELEASE_VERSION" || release_fail "PR #$pr_number does not use a stable release/v<version> branch."
  RELEASE_TARGET="$(jq -er '.mergeCommit.oid | select(type == "string")' <<< "$pr_json")" || release_fail "PR #$pr_number has no merge commit."
  release_validate_target "$RELEASE_TARGET"
  RELEASE_PR_URL="$(jq -er '.url' <<< "$pr_json")"
  RELEASE_TAG="v$RELEASE_VERSION"

  changed_paths="$(gh pr diff "$pr_number" --name-only)" || release_fail "Could not read changed paths for PR #$pr_number."
  package_seen=0
  changelog_seen=0
  while IFS= read -r path; do
    [[ -n "$path" ]] || continue
    case "$path" in
      package.json)
        package_seen=1
        ;;
      CHANGELOG.md)
        changelog_seen=1
        ;;
      .changeset/*.md) ;;
      *) release_fail "Release PR #$pr_number contains unexpected path $path." ;;
    esac
  done <<< "$changed_paths"
  (( package_seen == 1 && changelog_seen == 1 )) || release_fail "Release PR #$pr_number must modify package.json and CHANGELOG.md."
}

release_validate_publication_candidate() {
  release_validate_target_version
  release_require_unpublished_version "$RELEASE_VERSION"
  release_require_version_newer_than_npm "$RELEASE_VERSION"
  release_remote_tag_exists "$RELEASE_TAG" && release_fail "Remote tag $RELEASE_TAG already exists."
  release_github_release_exists "$RELEASE_TAG" && release_fail "GitHub release $RELEASE_TAG already exists."
  release_require_no_active_workflows
}

release_validate_target_version() {
  local checked_in_version

  git fetch --quiet origin "$RELEASE_BASE_BRANCH" || release_fail "Could not fetch origin/$RELEASE_BASE_BRANCH."
  git merge-base --is-ancestor "$RELEASE_TARGET" "origin/$RELEASE_BASE_BRANCH" || release_fail "Release target $RELEASE_TARGET is not contained in origin/$RELEASE_BASE_BRANCH."

  checked_in_version="$(git show "$RELEASE_TARGET:package.json" | jq -er '.version | select(type == "string")')" || release_fail "Could not read package version at $RELEASE_TARGET."
  [[ "$checked_in_version" == "$RELEASE_VERSION" ]] || release_fail "Package version $checked_in_version at $RELEASE_TARGET does not match $RELEASE_VERSION."
}

release_load_existing_release() {
  local release_json

  release_json="$(gh release view "$RELEASE_TAG" --json tagName,targetCommitish,url,isDraft,isPrerelease,publishedAt)" || release_fail "Could not read GitHub release $RELEASE_TAG."
  jq -e \
    --arg tag "$RELEASE_TAG" \
    --arg target "$RELEASE_TARGET" '
      .tagName == $tag and
      .targetCommitish == $target and
      .isDraft == false and
      .isPrerelease == false and
      (.publishedAt | type == "string" and length > 0)
    ' <<< "$release_json" >/dev/null || release_fail "GitHub release $RELEASE_TAG is not a stable release at $RELEASE_TARGET."

  RELEASE_URL="$(jq -er '.url' <<< "$release_json")"
  RELEASE_PUBLISHED_AT="$(jq -er '.publishedAt' <<< "$release_json")"
}
