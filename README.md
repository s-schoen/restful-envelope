# @s-schoen/restful-envelope

An ESM-only TypeScript library for REST API envelopes.

Provides typed single-resource response construction and strict Zod validation. See the
[resource response guide](./docs/resource.md) for the response contract and usage examples.

Supports error responses based on
[RFC 9457 Problem Details](https://www.rfc-editor.org/rfc/rfc9457.html), including typed response
creation and Zod validation. See the [error response guide](./docs/error.md) for details and
examples.

Also provides typed health endpoint responses with aggregate and component-level statuses, HTTP
status mapping, and Zod validation. See the [health response guide](./docs/health.md) for details
and examples.

## License

[MIT](./LICENSE)
