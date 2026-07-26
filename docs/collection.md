# Collection Responses

## Response Format

A collection response contains a page of resource representations under `data` and the page's
navigation metadata under `pagination`. Serve the response as `application/json`.

```json
{
  "data": [
    {
      "id": "user-42",
      "name": "Ada"
    },
    {
      "id": "user-43",
      "name": "Grace"
    }
  ],
  "pagination": {
    "offset": 0,
    "limit": 2,
    "nextOffset": 2,
    "total": 3
  }
}
```

Pagination uses offsets into the filtered, deterministically ordered result set:

- `offset` is the applied zero-based position of the first resource in `data`.
- `limit` is the effective maximum page size after applying server defaults and caps. The response
  can contain fewer resources.
- `nextOffset` is the first position after the returned resources, or `null` when no later resource
  exists. When present, it equals `offset + data.length` and is authoritative for navigation.
- `total` is an optional exact count of matching resources before pagination. Omit it when the
  endpoint did not compute a count. Whether it is included must be predictable from the endpoint
  contract or an explicit request option.

Every collection response includes `pagination`, including a collection that fits in one page. A
valid offset beyond the end returns an empty `data` array and a `null` `nextOffset`; it is not an
error.

## Data Type

`CollectionResponse<T>` models the response body and requires every resource in `data` to be an
object. Use `createCollectionResponse()` to construct the envelope while inferring `T`. The helper
retains the data array and pagination object by reference and does not clone, freeze, or validate
them.

Use `createUnpaginatedCollectionResponse()` when an endpoint deliberately returns its complete
collection at once. It accepts only the data array and creates final-page metadata with an offset of
zero, a `null` `nextOffset`, and an exact `total`. Its limit equals the number of resources, except
that an empty collection uses the minimum valid limit of one.

```ts
import { createUnpaginatedCollectionResponse } from "@s-schoen/restful-envelope";

const response = createUnpaginatedCollectionResponse([
  { id: "user-42", name: "Ada" },
  { id: "user-43", name: "Grace" },
]);
```

Use `createCollectionResponseFromLookahead()` when a database query fetches up to `limit + 1`
resources. The helper removes the extra resource, derives `nextOffset`, and optionally includes an
exact `total`. An input containing exactly `limit` resources is a final page because the requested
lookahead resource was not returned. The helper creates a shallow data-array copy and throws a
`RangeError` if the input contains more than `limit + 1` resources.

## Backend With Hono

```ts
import { Hono } from "hono";
import { z } from "zod/v4";
import { createCollectionResponseFromLookahead } from "@s-schoen/restful-envelope";

const app = new Hono();
const users = [
  { id: "user-42", name: "Ada" },
  { id: "user-43", name: "Grace" },
  { id: "user-44", name: "Katherine" },
];
const paginationQuerySchema = z.object({
  offset: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

app.get("/users", (c) => {
  const { offset, limit } = paginationQuerySchema.parse(c.req.query());
  // A database query would use OFFSET offset and LIMIT limit + 1.
  const rows = users.slice(offset, offset + limit + 1);

  return c.json(
    createCollectionResponseFromLookahead(rows, {
      offset,
      limit,
      total: users.length,
    }),
  );
});
```

## Frontend With Fetch

Use `createCollectionResponseSchema()` with the resource's Zod schema to validate an unknown body.
The generated schema rejects unknown top-level and pagination fields, unsafe or invalid pagination
integers, pages larger than their limit, and invalid continuation offsets. It also requires the
resource schema to accept and produce an object.

```ts
import { z } from "zod/v4";
import { createCollectionResponseSchema } from "@s-schoen/restful-envelope/schemas";

const userSchema = z.object({
  id: z.string(),
  name: z.string(),
});
const userCollectionResponseSchema = createCollectionResponseSchema(userSchema);

const response = await fetch("/users?offset=0&limit=20");

if (!response.ok) {
  throw new Error(`The request failed with status ${response.status}.`);
}

const result = userCollectionResponseSchema.safeParse(await response.json());

if (!result.success) {
  throw new Error("The server returned an invalid collection response.");
}

for (const user of result.data.data) {
  console.log(user.name);
}

if (result.data.pagination.nextOffset !== null) {
  console.log(`The next page starts at ${result.data.pagination.nextOffset}.`);
}
```
