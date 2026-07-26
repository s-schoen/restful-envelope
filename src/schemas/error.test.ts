import { describe, expect, expectTypeOf, test } from "vitest";
import { z } from "zod/v4";

import { problemDetailsSchema } from "./error.js";

const validationProblemSchema = problemDetailsSchema.safeExtend({
  type: z.literal("https://api.example.com/problems/validation"),
  errors: z.array(
    z.object({
      detail: z.string(),
      pointer: z.string(),
    }),
  ),
});

describe("Problem Details schemas", () => {
  test("accepts standard and extension members", () => {
    const problem = {
      type: "https://api.example.com/problems/out-of-credit",
      title: "You do not have enough credit.",
      status: 403,
      detail: "Your current balance is 30, but that costs 50.",
      instance: "/accounts/123/messages/abc",
      balance: 30,
      accounts: ["/accounts/123", "/accounts/456"],
    };

    expect(problemDetailsSchema.parse(problem)).toEqual(problem);
  });

  test("validates and infers extensions defined with safeExtend", () => {
    const body: unknown = {
      type: "https://api.example.com/problems/validation",
      title: "Request validation failed",
      status: 422,
      errors: [{ detail: "Must be positive", pointer: "#/age" }],
      requestId: "request-123",
    };

    const problem = validationProblemSchema.parse(body);

    expect(problem.errors).toEqual([{ detail: "Must be positive", pointer: "#/age" }]);
    expectTypeOf(problem.type).toEqualTypeOf<"https://api.example.com/problems/validation">();
    expectTypeOf(problem.errors).toEqualTypeOf<{ detail: string; pointer: string }[]>();
    expectTypeOf(problem.requestId).toBeUnknown();
  });

  test("rejects missing or malformed typed extensions", () => {
    const problem = {
      type: "https://api.example.com/problems/validation",
      title: "Request validation failed",
      status: 422,
    };

    expect(validationProblemSchema.safeParse(problem).success).toBe(false);
    expect(
      validationProblemSchema.safeParse({
        ...problem,
        errors: [{ detail: 42, pointer: "#/age" }],
      }).success,
    ).toBe(false);
  });

  test.each([
    { title: "Bad Request", status: 400 },
    { type: "about:blank", status: 400 },
    { type: "about:blank", title: "Bad Request" },
  ])("rejects a problem missing a required member", (problem) => {
    expect(problemDetailsSchema.safeParse(problem).success).toBe(false);
  });

  test.each([
    "about:blank",
    "https://api.example.com/problems/validation",
    "tag:example@example.org,2021-09-17:OutOfLuck",
    "urn:uuid:123e4567-e89b-12d3-a456-426614174000",
    "/problems/validation",
    "../problems/validation",
    "#problem",
    "",
  ])("accepts URI reference %j", (uriReference) => {
    const problem = {
      type: uriReference,
      title: "Problem",
      status: 400,
    };

    expect(problemDetailsSchema.parse(problem)).toEqual(problem);
  });

  test.each(["contains whitespace", "invalid%escape", "one#two#three", "1invalid:value"])(
    "rejects invalid URI reference %j",
    (uriReference) => {
      expect(
        problemDetailsSchema.safeParse({
          type: uriReference,
          title: "Problem",
          status: 400,
        }).success,
      ).toBe(false);
    },
  );

  test.each([99, 600, 200.5])("rejects invalid HTTP status %s", (status) => {
    expect(
      problemDetailsSchema.safeParse({
        type: "about:blank",
        title: "Problem",
        status,
      }).success,
    ).toBe(false);
  });

  test("preserves unknown extension values", () => {
    const callback = () => undefined;
    const problem = {
      type: "about:blank",
      title: "Internal Server Error",
      status: 500,
      callback,
    };

    expect(problemDetailsSchema.parse(problem)).toEqual(problem);
  });
});
