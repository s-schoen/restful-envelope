import { describe, expect, expectTypeOf, test } from "vitest";
import { z } from "zod/v4";

import type { HealthStatus } from "../health.js";
import { healthResponseSchema } from "./index.js";

type ParsedHealthResponse = z.output<typeof healthResponseSchema>;
type ParsedComponentHealthStatus = NonNullable<ParsedHealthResponse["components"]>[number];

describe("healthResponseSchema", () => {
  test("accepts a health response with component details", () => {
    const response = {
      status: "degraded",
      service: "payments",
      components: [
        { name: "database", status: "healthy" },
        { name: "email", status: "degraded", detail: "Delivery is delayed." },
      ],
    };

    expect(healthResponseSchema.parse(response)).toEqual(response);
  });

  test.each(["healthy", "degraded", "unhealthy"] as const)("accepts %s status", (status) => {
    expect(healthResponseSchema.parse({ status })).toEqual({ status });
  });

  test.each([
    {},
    { status: "unknown" },
    { status: "healthy", service: 42 },
    { status: "healthy", components: {} },
    { status: "healthy", components: [{ status: "healthy" }] },
    { status: "healthy", components: [{ name: "database", status: "unknown" }] },
    { status: "healthy", components: [{ name: "database", status: "healthy", detail: 42 }] },
  ])("rejects invalid response %#", (response) => {
    expect(healthResponseSchema.safeParse(response).success).toBe(false);
  });

  test("infers health response members", () => {
    expectTypeOf<ParsedHealthResponse["status"]>().toEqualTypeOf<HealthStatus>();
    expectTypeOf<ParsedHealthResponse["service"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<ParsedComponentHealthStatus["name"]>().toEqualTypeOf<string>();
    expectTypeOf<ParsedComponentHealthStatus["status"]>().toEqualTypeOf<HealthStatus>();
    expectTypeOf<ParsedComponentHealthStatus["detail"]>().toEqualTypeOf<string | undefined>();
  });
});
