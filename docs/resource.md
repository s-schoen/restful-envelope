# Resource Responses

## Response Format

A resource response contains exactly one successful resource representation under `data`. Serve
the response as `application/json`.

```json
{
  "data": {
    "id": "user-42",
    "name": "Ada"
  }
}
```

The application owns the complete shape of `data`, including identifiers, attributes, and related
resources.

Use this format for any successful operation that returns one resource, including retrieval,
creation, and update operations. Responses without a body, such as `204` or `304`, do not use it.

## Data Type

`ResourceResponse<T>` models the response body and requires `T` to be an object. Use
`createResourceResponse()` to construct the envelope while inferring `T`. The helper retains the
resource by reference and does not clone, freeze, or validate it.

## Backend With Hono

```ts
import { Hono } from "hono";
import {
  PROBLEM_JSON_MEDIA_TYPE,
  createResourceResponse,
  notFoundProblem,
} from "@s-schoen/restful-envelope";

const app = new Hono();

app.get("/users/:id", (c) => {
  const id = c.req.param("id");

  if (id !== "user-42") {
    const problem = notFoundProblem.create({
      detail: `No user exists with ID ${id}.`,
    });

    return new Response(JSON.stringify(problem), {
      status: problem.status,
      headers: { "Content-Type": PROBLEM_JSON_MEDIA_TYPE },
    });
  }

  return c.json(createResourceResponse({ id, name: "Ada" }));
});
```

See the [error response guide](./error.md) for more Problem Details examples.

## Frontend With Fetch

Use `createResourceResponseSchema()` with the resource's Zod schema to validate an unknown body.
The generated schema rejects unknown top-level envelope fields and requires the resource schema to
accept and produce an object. Composed schemas, including discriminated unions and
object-preserving refinements and transforms, remain supported.

```ts
import { z } from "zod/v4";
import { createResourceResponseSchema } from "@s-schoen/restful-envelope/schemas";

const userSchema = z.object({
  id: z.string(),
  name: z.string(),
});
const userResponseSchema = createResourceResponseSchema(userSchema);

const response = await fetch("/users/user-42");

if (!response.ok) {
  throw new Error(`The request failed with status ${response.status}.`);
}

const result = userResponseSchema.safeParse(await response.json());

if (!result.success) {
  throw new Error("The server returned an invalid resource response.");
}

console.log(result.data.data.name);
```
