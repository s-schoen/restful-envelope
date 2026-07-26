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
HTTP errors are available through `badRequestProblem`, `notFoundProblem`, and
`internalServerErrorProblem`.

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

For a known problem type, use Zod's `safeExtend()` to validate and infer its extensions:

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
