# @s-schoen/restful-envelope

## 0.3.0

### Minor Changes

- 3aef143: Add a schema-backed problem contract that converts Zod validation errors into structured 400
  Problem Details responses.
- 9112a1a: Add reusable Problem Details definitions for common HTTP client errors and preserve literal status
  types for built-in definitions.

## 0.2.0

### Minor Changes

- bcb8218: Add schema-backed Problem Details contracts with validated creation and response parsing.
- cd60b4d: Add a schema factory for closed discriminated unions of Problem Details contracts.
