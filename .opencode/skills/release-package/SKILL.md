---
name: release-package
description: Prepares and publishes stable npm releases for this repository through Changesets, release pull requests, and GitHub Releases with explicit human approval. Use when the user asks to prepare, continue, publish, or create a release for @s-schoen/restful-envelope.
---

# Release Package

## Quick Start

- `Prepare a release` runs `scripts/prepare-release.sh`, then stops for PR review.
- `Continue release PR #12` plans publication, asks for approval, and publishes the release.

## Rules

- Work from the repository root and read `RELEASING.md` before acting. It is authoritative.
- Treat the scripts below as the complete release execution API. Do not expand a phase into custom
  `git`, `gh`, `jq`, `pnpm`, polling, or shell commands.
- Support stable releases only. Never create a draft or prerelease.
- Keep two human gates: GitHub review and merge of the PR, then confirmation before publication.
- Never merge the release PR, choose a later incidental `master` commit, or bypass a failed check.
- Never automatically delete, move, or recreate a release or tag, or rerun a failed release workflow.

## Prepare A Release

1. Run `bash .opencode/skills/release-package/scripts/prepare-release.sh`. It owns isolation,
   validation, versioning, verification, the release commit, push, and PR creation.
2. Return the script's PR URL and version. Tell the human to review it, wait for CI, and rebase-merge
   it. Stop and give the exact continuation prompt `Continue release PR #<number>`.

## Continue A Release

1. Resolve the release PR number from the conversation or ask for it.
2. Run `bash .opencode/skills/release-package/scripts/plan-publication.sh <pr-number>`.
3. Show the script's version, exact target SHA, tag, and complete notes. Use the question tool to ask
   for explicit publication confirmation. Stop if it is not granted.
4. Run `bash .opencode/skills/release-package/scripts/publish-release.sh <pr-number> <target-sha>`
   with the exact target from step 2. Report the returned PR, release, workflow, npm, and attestation
   URLs.

## Resume Publication

If publication is interrupted or does not return structured output, run
`bash .opencode/skills/release-package/scripts/verify-publication.sh <pr-number> <target-sha>` only
with the already approved target. It safely reports an absent release and never creates or changes
one.

## Failure Recovery

The publication scripts collect failed workflow logs and report whether npm contains the version.
If verification returns `release-absent` with `npmPublished: false`, the approved publication did
not start and the same `publish-release.sh` call is safe to retry. For `workflow-missing` or
`monitoring-error`, retry only `verify-publication.sh`. For `workflow-failed`, `metadata-timeout`, or
any state where npm publication is true or unknown, present the output and recovery choices from
`RELEASING.md`, then wait for the human. Do not construct recovery commands.
