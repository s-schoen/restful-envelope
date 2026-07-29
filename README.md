# Restful Envelope

[![CI](https://github.com/s-schoen/restful-envelope/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/s-schoen/restful-envelope/actions/workflows/ci.yml)
[![Test Coverage](https://codecov.io/gh/s-schoen/restful-envelope/branch/master/graph/badge.svg)](https://codecov.io/gh/s-schoen/restful-envelope)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

An opinionated library to return structured data in a restful API.

## Key Features

Defines types and Zod schemas for uniform REST API responses, including schema-backed Problem
Details contracts and discriminated unions that can be shared by producers and consumers.

Supported response types:

- [Error responses](./docs/error.md) according to [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html)
- [Service health](./docs/health.md)
- Generic [single resource responses](./docs/resource.md)
- Generic [collection responses](./docs/collection.md) including pagination support

## Getting Started

Install the library:

```shell
npm i @s-schoen/restful-envelope
```

### Backend

```ts
import { createResourceResponse } from "@s-schoen/restful-envelope";

const user = { id: "user-42", name: "Ada" };

return Response.json(createResourceResponse(user));
```

### Frontend

```ts
import { z } from "zod/v4";
import { createResourceResponseSchema } from "@s-schoen/restful-envelope/schemas";

const userResponseSchema = createResourceResponseSchema(
  z.object({ id: z.string(), name: z.string() }),
);

const response = await fetch("/users/user-42");

if (!response.ok) {
  throw new Error(`Request failed with status ${response.status}.`);
}

const { data: user } = userResponseSchema.parse(await response.json());
```

## License

[MIT](./LICENSE)
