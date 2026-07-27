# Releasing

This package publishes stable releases to npm when a stable GitHub release is published. The
GitHub release becomes visible before the npm workflow finishes.

## Prepare A Version

Changes that affect the published package should add Changesets before they reach `master`. When a
release is ready:

1. Create a release branch from the intended `master` revision.
2. Run `pnpm changeset:version`.
3. Review the package version and generated `CHANGELOG.md` section.
4. Run `pnpm verify`.
5. Commit the generated changes and open a pull request into `master`.
6. Wait for required CI to pass and rebase-merge the pull request.
7. Record the exact `master` commit that should be released.

The release tag may target any commit contained in `master` whose checked-in version matches the
tag. Select it deliberately: every source change through that commit is included in the package.

## Publish A Release

Wait for any previous release workflow to finish before starting another release. Then:

1. Confirm that the package version is a stable semantic version newer than npm's current `latest`.
2. Create a stable GitHub release at the selected `master` commit.
3. Name its tag `v<version>`, for example `v0.2.0` for package version `0.2.0`.
4. Copy the matching `CHANGELOG.md` section into the release notes.
5. Publish the GitHub release and monitor the `Release` workflow.
6. Confirm that npm shows the new version and its provenance attestation.

The workflow does not publish drafts or prereleases and has no manual dispatch trigger. It verifies
the exact tag, performs a clean install and `pnpm verify` without publishing credentials, and packs
one tarball. A separate serialized job publishes that exact tarball from the `npm` environment with
OIDC and provenance.

## Recover A Failure

First check whether npm received the version:

```sh
pnpm view "@s-schoen/restful-envelope@<version>" version
```

If npm does not contain the version:

1. Rerun the existing workflow for a transient service or network failure.
2. If tagged source must change, delete the failed GitHub release and tag, fix the versioned commit,
   and recreate the same unused version.

If npm contains the version, do not rerun, move the tag, or try to reuse the version. npm versions
are immutable, and duplicate publication attempts intentionally fail. Publish any code correction
under a new version.
