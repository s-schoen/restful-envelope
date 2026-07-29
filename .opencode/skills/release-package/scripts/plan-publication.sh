#!/usr/bin/env bash

# Validates a merged release PR and emits the exact publication approval data as JSON.

set -euo pipefail

readonly script_directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
source "$script_directory/release-common.sh"

(( $# == 1 )) || release_fail "Usage: plan-publication.sh <release-pr-number>"
requested_pr="$1"

release_require_commands git gh jq pnpm
release_require_repository_root
gh auth status >/dev/null 2>&1 || release_fail "GitHub CLI authentication is not valid."
release_require_repository_identity

release_load_merged_release_pr "$requested_pr"
release_validate_publication_candidate
release_notes="$(release_extract_notes "$RELEASE_VERSION" "$RELEASE_TARGET")" || release_fail "Could not extract release notes at $RELEASE_TARGET."
[[ -n "$release_notes" ]] || release_fail "Release notes are empty."

jq -n \
  --argjson pr "$requested_pr" \
  --arg prUrl "$RELEASE_PR_URL" \
  --arg version "$RELEASE_VERSION" \
  --arg target "$RELEASE_TARGET" \
  --arg tag "$RELEASE_TAG" \
  --arg notes "$release_notes" \
  '{pr: $pr, prUrl: $prUrl, version: $version, target: $target, tag: $tag, notes: $notes}'
