import { describe, expect, expectTypeOf, test } from "vitest";

import { getHealthHTTPStatusCode } from "./health.js";

describe("getHealthHTTPStatusCode", () => {
  test.each([
    { status: "healthy", expectedStatusCode: 200 },
    { status: "degraded", expectedStatusCode: 200 },
    { status: "unhealthy", expectedStatusCode: 503 },
  ] as const)("maps $status to $expectedStatusCode", ({ status, expectedStatusCode }) => {
    const statusCode = getHealthHTTPStatusCode({ status });

    expect(statusCode).toBe(expectedStatusCode);
    expectTypeOf(statusCode).toEqualTypeOf<200 | 503>();
  });
});
