# Repository Guide

This repository contains a small library package that defines a common REST API data envelop format, e.g. data or error responses.
The library should be able to be used in both backend (Node.js) and frontend (browser APIs).

## Structure

- This is one ESM-only library
- There are two public APIs: `src/index.ts` backs `@s-schoen/restful-envelope`, and `src/schemas/index.ts` backs `@s-schoen/restful-envelope/schemas`. New modules are not public until re-exported from the appropriate entrypoint.
- TypeScript uses `NodeNext`, `verbatimModuleSyntax`, and `erasableSyntaxOnly`. Relative source imports need `.js` suffixes; use type-only imports where required and avoid TypeScript syntax that emits runtime code.

## Verification

- Run the CI-equivalent check with `pnpm verify`. Its required sequence is format check, type-aware lint, coverage tests, then build plus `publint`.
- Tests are colocated as `src/**/*.test.ts` and run in Vitest's Node environment.
- Run one file with `pnpm exec vitest run src/path/to/file.test.ts`; focus a test with `pnpm exec vitest run src/path/to/file.test.ts -t "test name"`.

## Releases

- Release metadata uses Changesets with `master` as its configured base branch. Use `pnpm changeset` and `pnpm changeset:version` rather than the raw CLI.
