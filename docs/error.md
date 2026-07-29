# Error Responses

## RFC 9457

[RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html) defines Problem Details, a standard
machine-readable error format for HTTP APIs. JSON responses use the
`application/problem+json` media type and can contain:

- `type`: a URI reference identifying the kind of problem
- `title`: a short summary of that problem type
- `status`: the HTTP status code for this occurrence
- `detail`: an optional explanation specific to this occurrence
- `instance`: an optional URI reference identifying this occurrence

Problem types can add top-level extension members for structured, machine-readable information.
The `type` URI is the primary identifier; common forms include HTTPS URLs, URNs, `tag:` URIs, and
`about:blank` for errors with no semantics beyond their HTTP status.

## Data Type

`ProblemDetails<Extensions>` models the response body. Although RFC 9457 permits every standard
member to be omitted, this package requires `type`, `title`, and `status`; `detail` and `instance`
remain optional. If no extension type is supplied, additional members are exposed as `unknown`.

Use `defineProblemType<Extensions>()` to define stable `type`, `title`, and `status` values once.
Its `create()` method combines them with occurrence-specific details and typed extensions. Generic
HTTP errors are available as reusable `about:blank` definitions:

- `badRequestProblem` (`400`)
- `unauthorizedProblem` (`401`)
- `forbiddenProblem` (`403`)
- `notFoundProblem` (`404`)
- `methodNotAllowedProblem` (`405`)
- `conflictProblem` (`409`)
- `unsupportedMediaTypeProblem` (`415`)
- `internalServerErrorProblem` (`500`)

The HTTP response status must match the body's `status`, and JSON responses must use
`application/problem+json`.

## Backend With Hono

```ts
import { Hono } from "hono";
import { PROBLEM_JSON_MEDIA_TYPE, notFoundProblem } from "@s-schoen/restful-envelope";

const app = new Hono();

app.get("/users/:id", (c) => {
  const id = c.req.param("id");

  if (id !== "42") {
    const problem = notFoundProblem.create({
      detail: `No user exists with ID ${id}.`,
      instance: `urn:uuid:${crypto.randomUUID()}`,
    });

    return new Response(JSON.stringify(problem), {
      status: problem.status,
      headers: { "Content-Type": PROBLEM_JSON_MEDIA_TYPE },
    });
  }

  return c.json({ id, name: "Ada" });
});
```

Custom problem types define their stable metadata and typed extensions once:

```ts
import { Hono } from "hono";
import { PROBLEM_JSON_MEDIA_TYPE, defineProblemType } from "@s-schoen/restful-envelope";

const validationProblem = defineProblemType<{
  errors: { detail: string; pointer: string }[];
}>({
  type: "https://api.example.com/problems/validation",
  title: "Request validation failed",
  status: 422,
});

const app = new Hono();

app.post("/profiles", async (c) => {
  const profile = await c.req.json<{ age: number }>();

  if (profile.age >= 18) {
    return c.json({ created: true }, 201);
  }

  const problem = validationProblem.create({
    detail: "The profile contains invalid fields.",
    instance: `urn:uuid:${crypto.randomUUID()}`,
    errors: [{ detail: "Must be at least 18", pointer: "#/age" }],
  });

  return new Response(JSON.stringify(problem), {
    status: problem.status,
    headers: { "Content-Type": PROBLEM_JSON_MEDIA_TYPE },
  });
});
```

## Shared Schema-Backed Contracts

Use `defineProblemContract()` when producers and consumers share a Zod dependency. It derives
creation input and parsed output types from one extension shape, validates occurrences during
creation, and exposes a response schema for the same problem type:

```ts
import { z } from "zod/v4";
import { defineProblemContract } from "@s-schoen/restful-envelope/schemas";

export const validationProblem = defineProblemContract({
  type: "https://api.example.com/problems/validation",
  title: "Request validation failed",
  status: 422,
  extensions: {
    errors: z.array(
      z.object({
        detail: z.string(),
        pointer: z.string(),
      }),
    ),
  },
});

const problem = validationProblem.create({
  detail: "The profile contains invalid fields.",
  errors: [{ detail: "Must be at least 18", pointer: "#/age" }],
});

const parsedProblem = validationProblem.schema.parse(await response.json());
```

The contract exposes literal `type` and `status` values. `create()` validates synchronously,
applies extension transforms and defaults, emits the canonical title, rejects undeclared members,
and returns a shallow-frozen object. Asynchronous extension schemas can be parsed with
`schema.parseAsync()`, but cannot be used through `create()`.

For response parsing, the schema requires the contract's `type` and `status`, accepts localized
nonempty titles, and preserves undeclared extension members as `unknown`. This allows a consumer to
accept extensions added by a newer producer without losing them.

## Request Validation With Hono

Use `defineZodValidationProblemContract()` with `@hono/zod-validator` to convert a failed Zod
validation result into a schema-backed `400 Bad Request` problem:

```ts
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod/v4";
import { PROBLEM_JSON_MEDIA_TYPE } from "@s-schoen/restful-envelope";
import { defineZodValidationProblemContract } from "@s-schoen/restful-envelope/schemas";

const profileSchema = z.object({
  age: z.number().int().min(18),
  name: z.string().min(1),
});

const requestValidationProblem = defineZodValidationProblemContract({
  type: "https://api.example.com/problems/request-validation",
  title: "Request validation failed",
});

const app = new Hono();

app.post(
  "/profiles",
  zValidator("json", profileSchema, (result) => {
    if (result.success) {
      return;
    }

    const problem = requestValidationProblem.createFromZodError(result.error);

    return new Response(JSON.stringify(problem), {
      status: problem.status,
      headers: { "Content-Type": PROBLEM_JSON_MEDIA_TYPE },
    });
  }),
  (c) => c.json({ profile: c.req.valid("json") }, 201),
);
```

The factory fixes `status` to `400` while the caller owns the stable `type` and `title`. It returns a
normal `ProblemContract`, so manually supplied occurrences can still be created with `create()` and
responses can be parsed with `schema`.

Each top-level Zod issue becomes an `errors` entry containing its message as `detail` and, when its
path is JSON-compatible, an RFC 6901 URI-fragment `pointer`. Pointers are relative to the value
validated by Zod, so `#/age` refers to the `age` member of the Hono `json` target in this example.
Malformed JSON is rejected by Hono before Zod runs and therefore requires separate error handling.

## Problem Type Unions

Use `createProblemDetailsUnionSchema()` to combine the problem contracts supported by an endpoint
into a closed Zod discriminated union:

```ts
import { z } from "zod/v4";
import {
  createProblemDetailsUnionSchema,
  defineProblemContract,
} from "@s-schoen/restful-envelope/schemas";

const validationProblem = defineProblemContract({
  type: "https://api.example.com/problems/validation",
  title: "Request validation failed",
  status: 422,
  extensions: {
    errors: z.array(z.string()),
  },
});

const conflictProblem = defineProblemContract({
  type: "https://api.example.com/problems/conflict",
  title: "Conflict",
  status: 409,
  extensions: {
    conflictingId: z.string(),
  },
});

const endpointProblemSchema = createProblemDetailsUnionSchema(validationProblem, conflictProblem);

declare const problemBody: unknown;

const problem = endpointProblemSchema.parse(problemBody);

switch (problem.type) {
  case validationProblem.type:
    problem.errors;
    break;
  case conflictProblem.type:
    problem.conflictingId;
    break;
  default:
    problem satisfies never;
}
```

The schema rejects problem types absent from the supplied contracts. Use `problemDetailsSchema`
separately when an application needs to accept arbitrary Problem Details.

Every supplied contract must have a unique `type`; duplicates are rejected when the schema is
created. Consequently, a union cannot contain multiple `about:blank` contracts distinguished only
by status. A single-contract union is supported, although using that contract's `schema` directly
is simpler.

## Frontend With Fetch

Use `problemDetailsSchema` when no problem-specific extensions are expected:

```ts
import { problemDetailsSchema } from "@s-schoen/restful-envelope/schemas";

const response = await fetch("/users/7");

if (!response.ok) {
  const result = problemDetailsSchema.safeParse(await response.json());

  if (!result.success) {
    throw new Error("The server returned an invalid Problem Details response.");
  }

  console.error(result.data.title, result.data.detail);
}
```

When no shared schema-backed contract is available, use Zod's `safeExtend()` to validate and infer
extensions for a known problem type:

```ts
import { z } from "zod/v4";
import { problemDetailsSchema } from "@s-schoen/restful-envelope/schemas";

const validationProblemSchema = problemDetailsSchema.safeExtend({
  type: z.literal("https://api.example.com/problems/validation"),
  errors: z.array(
    z.object({
      detail: z.string(),
      pointer: z.string(),
    }),
  ),
});

const response = await fetch("/profiles", { method: "POST" });

if (!response.ok) {
  const result = validationProblemSchema.safeParse(await response.json());

  if (result.success) {
    result.data.errors.forEach((error) => {
      console.error(error.pointer, error.detail);
    });
  }
}
```
