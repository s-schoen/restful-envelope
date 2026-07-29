#!/usr/bin/env bash

# Revalidates approved publication data, creates the stable GitHub release, and verifies publication.

set -euo pipefail

readonly script_directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
source "$script_directory/release-common.sh"

(( $# == 2 )) || release_fail "Usage: publish-release.sh <release-pr-number> <approved-target-sha>"
requested_pr="$1"
approved_target="$2"

release_require_commands git gh jq pnpm mktemp
release_require_repository_root
release_validate_target "$approved_target"
gh auth status >/dev/null 2>&1 || release_fail "GitHub CLI authentication is not valid."
release_require_repository_identity

release_load_merged_release_pr "$requested_pr"
[[ "$RELEASE_TARGET" == "$approved_target" ]] || release_fail "PR #$requested_pr target $RELEASE_TARGET does not match approved target $approved_target."

release_log "Repeating publication checks for $RELEASE_TAG at $RELEASE_TARGET."
release_validate_publication_candidate
release_notes="$(release_extract_notes "$RELEASE_VERSION" "$RELEASE_TARGET")" || release_fail "Could not extract release notes at $RELEASE_TARGET."
[[ -n "$release_notes" ]] || release_fail "Release notes are empty."
release_require_no_active_workflows

mkdir -p /tmp/opencode
notes_file="$(mktemp "/tmp/opencode/restful-envelope-$RELEASE_TAG-notes.XXXXXX.md")"
trap 'rm -f "$notes_file"' EXIT
printf '%s\n' "$release_notes" > "$notes_file"

release_log "Creating stable GitHub release $RELEASE_TAG."
gh release create "$RELEASE_TAG" \
  --target "$RELEASE_TARGET" \
  --title "$RELEASE_TAG" \
  --latest \
  --notes-file "$notes_file" >&2

release_load_existing_release
release_log "GitHub release created at $RELEASE_URL; monitoring publication."
bash "$script_directory/verify-publication.sh" "$requested_pr" "$approved_target"
