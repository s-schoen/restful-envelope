# Health Responses

## Health Endpoints

Health endpoints expose whether a service can perform the work represented by the endpoint. This
package defines a compact JSON response for aggregate service health and optional component or
dependency details. Serve the response as `application/json`.

## Response Format

A health response contains:

- `status`: the required aggregate service status
- `service`: an optional stable service identifier
- `components`: optional health details for components or dependencies

Each component contains a `name` and `status`, plus an optional human-readable `detail`. Component
statuses provide diagnostic context; `getHealthHTTPStatusCode()` uses only the aggregate top-level
status and does not calculate it from the components.

The supported statuses and corresponding HTTP response codes are:

| Status      | Meaning                                       | HTTP status |
| ----------- | --------------------------------------------- | ----------- |
| `healthy`   | The service is operating normally.            | `200`       |
| `degraded`  | The service is available, but with concerns.  | `200`       |
| `unhealthy` | The service cannot perform its intended work. | `503`       |

For example:

```json
{
  "status": "degraded",
  "service": "orders-api",
  "components": [
    {
      "name": "database",
      "status": "healthy"
    },
    {
      "name": "email",
      "status": "degraded",
      "detail": "Delivery may be delayed."
    }
  ]
}
```

Avoid exposing credentials, internal addresses, stack traces, or other sensitive operational data
through component names and details. Restrict access to detailed health endpoints when necessary.

## Data Type

`HealthResponse` models the response body, while `HealthStatus` and `ComponentHealthStatus` expose
the status vocabulary and component shape. `getHealthHTTPStatusCode()` maps an aggregate response
to `200` or `503`, keeping the body and HTTP response status consistent.

## Backend With Hono

```ts
import { Hono } from "hono";
import { getHealthHTTPStatusCode, type HealthResponse } from "@s-schoen/restful-envelope";

const app = new Hono();

app.get("/health", (c) => {
  const health = {
    status: "degraded",
    service: "orders-api",
    components: [
      { name: "database", status: "healthy" },
      { name: "email", status: "degraded", detail: "Delivery may be delayed." },
    ],
  } satisfies HealthResponse;

  return c.json(health, getHealthHTTPStatusCode(health));
});
```

## Frontend With Fetch

Use `healthResponseSchema` to validate an unknown response body. Parse the body regardless of
`response.ok`, because an unhealthy response intentionally uses HTTP `503` while still carrying a
valid health response.

```ts
import { healthResponseSchema } from "@s-schoen/restful-envelope/schemas";

const response = await fetch("/health");
const result = healthResponseSchema.safeParse(await response.json());

if (!result.success) {
  throw new Error("The server returned an invalid health response.");
}

if (result.data.status === "unhealthy") {
  console.error("The service is unavailable.", result.data.components);
}
```
