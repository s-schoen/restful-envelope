#!/usr/bin/env bash

# Resumes or performs workflow, npm, and provenance verification for an existing GitHub release.

set -euo pipefail

readonly script_directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
source "$script_directory/release-common.sh"

(( $# == 2 )) || release_fail "Usage: verify-publication.sh <release-pr-number> <release-target-sha>"
requested_pr="$1"
expected_target="$2"

load_npm_published_state() {
  npm_state="$(release_npm_version_state "$RELEASE_VERSION")"
  case "$npm_state" in
    true) npm_published_json=true ;;
    false) npm_published_json=false ;;
    unknown) npm_published_json=null ;;
    *) release_fail "Unexpected npm publication state $npm_state." ;;
  esac
}

release_require_commands git gh jq pnpm sleep
release_require_repository_root
release_validate_target "$expected_target"
gh auth status >/dev/null 2>&1 || release_fail "GitHub CLI authentication is not valid."
release_require_repository_identity

release_load_merged_release_pr "$requested_pr"
[[ "$RELEASE_TARGET" == "$expected_target" ]] || release_fail "PR #$requested_pr target $RELEASE_TARGET does not match expected target $expected_target."
release_validate_target_version
if ! release_github_release_exists "$RELEASE_TAG"; then
  load_npm_published_state
  jq -n \
    --arg version "$RELEASE_VERSION" \
    --arg target "$RELEASE_TARGET" \
    --argjson npmPublished "$npm_published_json" \
    '{status: "release-absent", version: $version, target: $target, npmPublished: $npmPublished}'
  exit 1
fi
release_load_existing_release

run_json=''
for (( attempt = 1; attempt <= 12; attempt += 1 )); do
  runs="$(gh run list --workflow "$RELEASE_WORKFLOW_NAME" --limit 100 --json databaseId,status,conclusion,headBranch,headSha,url,createdAt)" || release_fail "Could not query $RELEASE_WORKFLOW_NAME workflow runs."
  run_json="$(
    jq -c \
      --arg tag "$RELEASE_TAG" \
      --arg target "$RELEASE_TARGET" \
      --arg publishedAt "$RELEASE_PUBLISHED_AT" '
        map(select(
          .headBranch == $tag and
          .headSha == $target and
          .createdAt >= $publishedAt
        )) |
        sort_by(.createdAt) |
        last // empty
      ' <<< "$runs"
  )"
  [[ -n "$run_json" ]] && break
  sleep 5
done
if [[ -z "$run_json" ]]; then
  load_npm_published_state
  jq -n \
    --arg version "$RELEASE_VERSION" \
    --arg target "$RELEASE_TARGET" \
    --arg releaseUrl "$RELEASE_URL" \
    --argjson npmPublished "$npm_published_json" \
    '{status: "workflow-missing", version: $version, target: $target, releaseUrl: $releaseUrl, npmPublished: $npmPublished}'
  exit 1
fi

run_id="$(jq -er '.databaseId' <<< "$run_json")" || release_fail "Workflow result has no run ID."
run_url="$(jq -er '.url' <<< "$run_json")" || release_fail "Workflow result has no URL."
release_log "Watching $RELEASE_WORKFLOW_NAME workflow $run_id."
if ! gh run watch "$run_id" --exit-status >&2; then
  if ! run_state="$(gh run view "$run_id" --json status,conclusion,url,headSha,headBranch)"; then
    load_npm_published_state
    jq -n \
      --arg version "$RELEASE_VERSION" \
      --arg target "$RELEASE_TARGET" \
      --arg releaseUrl "$RELEASE_URL" \
      --arg workflowUrl "$run_url" \
      --argjson npmPublished "$npm_published_json" \
      '{status: "monitoring-error", version: $version, target: $target, releaseUrl: $releaseUrl, workflowUrl: $workflowUrl, npmPublished: $npmPublished}'
    exit 1
  fi

  run_status="$(jq -er '.status' <<< "$run_state")"
  run_conclusion="$(jq -r '.conclusion // ""' <<< "$run_state")"
  if [[ "$run_status" == 'completed' && "$run_conclusion" == 'success' ]]; then
    release_log "Workflow $run_id succeeded despite the watch command returning an error; continuing registry verification."
  elif [[ "$run_status" != 'completed' ]]; then
    load_npm_published_state
    jq -n \
      --arg version "$RELEASE_VERSION" \
      --arg target "$RELEASE_TARGET" \
      --arg releaseUrl "$RELEASE_URL" \
      --arg workflowUrl "$run_url" \
      --arg workflowStatus "$run_status" \
      --argjson npmPublished "$npm_published_json" \
      '{status: "monitoring-error", version: $version, target: $target, releaseUrl: $releaseUrl, workflowUrl: $workflowUrl, workflowStatus: $workflowStatus, npmPublished: $npmPublished}'
    exit 1
  else
    gh run view "$run_id" --log-failed >&2 || true
    load_npm_published_state
    case "$npm_state" in
      true)
        release_log "Workflow $run_id failed, but npm already contains immutable version $RELEASE_VERSION."
        ;;
      false)
        release_log "Workflow $run_id failed before npm received version $RELEASE_VERSION."
        ;;
      unknown)
        release_log "Workflow $run_id failed and npm publication state could not be determined."
        ;;
    esac
    jq -n \
      --arg version "$RELEASE_VERSION" \
      --arg target "$RELEASE_TARGET" \
      --arg releaseUrl "$RELEASE_URL" \
      --arg workflowUrl "$run_url" \
      --arg workflowConclusion "$run_conclusion" \
      --argjson npmPublished "$npm_published_json" \
      '{status: "workflow-failed", version: $version, target: $target, releaseUrl: $releaseUrl, workflowUrl: $workflowUrl, workflowConclusion: $workflowConclusion, npmPublished: $npmPublished}'
    exit 1
  fi
fi

latest=''
exact=''
predicate=''
attestation_url=''
for (( attempt = 1; attempt <= 24; attempt += 1 )); do
  latest="$(pnpm view "$RELEASE_PACKAGE_NAME" dist-tags.latest 2>/dev/null || true)"
  exact="$(pnpm view "$RELEASE_PACKAGE_NAME@$RELEASE_VERSION" version 2>/dev/null || true)"
  predicate="$(pnpm view "$RELEASE_PACKAGE_NAME@$RELEASE_VERSION" dist.attestations.provenance.predicateType 2>/dev/null || true)"
  attestation_url="$(pnpm view "$RELEASE_PACKAGE_NAME@$RELEASE_VERSION" dist.attestations.url 2>/dev/null || true)"
  if [[ "$latest" == "$RELEASE_VERSION" && "$exact" == "$RELEASE_VERSION" && "$predicate" == 'https://slsa.dev/provenance/v1' && -n "$attestation_url" ]]; then
    break
  fi
  sleep 5
done

if [[ "$latest" != "$RELEASE_VERSION" || "$exact" != "$RELEASE_VERSION" || "$predicate" != 'https://slsa.dev/provenance/v1' || -z "$attestation_url" ]]; then
  load_npm_published_state
  case "$npm_state" in
    true)
      release_log "npm contains immutable version $RELEASE_VERSION, but latest metadata or SLSA provenance did not converge."
      ;;
    false)
      release_log "npm does not contain version $RELEASE_VERSION after successful workflow $run_id."
      ;;
    unknown)
      release_log "npm publication state is unknown after metadata or provenance failed to converge."
      ;;
  esac
  jq -n \
    --arg version "$RELEASE_VERSION" \
    --arg target "$RELEASE_TARGET" \
    --arg releaseUrl "$RELEASE_URL" \
    --arg workflowUrl "$run_url" \
    --argjson npmPublished "$npm_published_json" \
    '{status: "metadata-timeout", version: $version, target: $target, releaseUrl: $releaseUrl, workflowUrl: $workflowUrl, npmPublished: $npmPublished}'
  exit 1
fi

npm_url="https://www.npmjs.com/package/$RELEASE_PACKAGE_NAME/v/$RELEASE_VERSION"
jq -n \
  --argjson pr "$requested_pr" \
  --arg prUrl "$RELEASE_PR_URL" \
  --arg version "$RELEASE_VERSION" \
  --arg target "$RELEASE_TARGET" \
  --arg releaseUrl "$RELEASE_URL" \
  --argjson workflow "$run_id" \
  --arg workflowUrl "$run_url" \
  --arg npmUrl "$npm_url" \
  --arg attestationUrl "$attestation_url" \
  '{status: "published", pr: $pr, prUrl: $prUrl, version: $version, target: $target, releaseUrl: $releaseUrl, workflow: $workflow, workflowUrl: $workflowUrl, npmUrl: $npmUrl, attestationUrl: $attestationUrl}'
