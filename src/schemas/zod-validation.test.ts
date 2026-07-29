import { describe, expect, expectTypeOf, test } from "vitest";
import { z } from "zod/v4";

import { defineZodValidationProblemContract, type ZodValidationProblemContract } from "./index.js";

const requestValidationProblem = defineZodValidationProblemContract({
  type: "https://api.example.com/problems/request-validation",
  title: "Request validation failed",
});

describe("defineZodValidationProblemContract", () => {
  test("creates schema-backed bad-request details from a Zod error", () => {
    const result = z
      .object({
        profile: z.object({ age: z.number().min(18, "Must be at least 18") }),
        tags: z.array(z.string({ error: "Must be a string" })),
      })
      .safeParse({ profile: { age: 16 }, tags: ["api", 42] });

    if (result.success) {
      throw new Error("Expected request validation to fail.");
    }

    const problem = requestValidationProblem.createFromZodError(result.error, {
      detail: "The request contains invalid fields.",
      instance: "urn:uuid:123e4567-e89b-12d3-a456-426614174000",
    });

    expect(problem).toEqual({
      type: "https://api.example.com/problems/request-validation",
      title: "Request validation failed",
      status: 400,
      detail: "The request contains invalid fields.",
      instance: "urn:uuid:123e4567-e89b-12d3-a456-426614174000",
      errors: [
        { detail: "Must be at least 18", pointer: "#/profile/age" },
        { detail: "Must be a string", pointer: "#/tags/1" },
      ],
    });
    expect(requestValidationProblem.schema.parse(problem)).toEqual(problem);
    expect(requestValidationProblem.status).toBe(400);
    expect(Object.isFrozen(requestValidationProblem)).toBe(true);
    expect(Object.isFrozen(problem)).toBe(true);
    expectTypeOf(requestValidationProblem.status).toEqualTypeOf<400>();
    expectTypeOf(problem.errors).toEqualTypeOf<
      { detail: string; pointer?: string | undefined }[]
    >();
  });

  test("retains the normal ProblemContract creation interface", () => {
    const problem = requestValidationProblem.create({
      errors: [{ detail: "Required", pointer: "#/name" }],
    });

    expect(problem.errors).toEqual([{ detail: "Required", pointer: "#/name" }]);
  });

  test("escapes issue paths as JSON Pointer URI fragments", () => {
    const error = new z.ZodError([
      {
        code: "custom",
        message: "Invalid nested value",
        path: ["a/b", "~key", "space key", "café", 0],
      },
    ]);

    expect(requestValidationProblem.createFromZodError(error).errors).toEqual([
      {
        detail: "Invalid nested value",
        pointer: "#/a~1b/~0key/space%20key/caf%C3%A9/0",
      },
    ]);
  });

  test("uses the document root and omits paths that cannot be represented", () => {
    const unpairedSurrogate = "\uD800";
    const error = new z.ZodError([
      { code: "custom", message: "Invalid document", path: [] },
      { code: "custom", message: "Invalid symbol property", path: [Symbol("field")] },
      { code: "custom", message: "Invalid surrogate property", path: [unpairedSurrogate] },
    ]);

    expect(requestValidationProblem.createFromZodError(error).errors).toEqual([
      { detail: "Invalid document", pointer: "#" },
      { detail: "Invalid symbol property" },
      { detail: "Invalid surrogate property" },
    ]);
  });

  test("accepts the Zod Core error type exposed by Hono", () => {
    const error: z.core.$ZodError = new z.ZodError([
      { code: "custom", message: "Invalid value", path: ["value"] },
    ]);

    expect(requestValidationProblem.createFromZodError(error).errors).toEqual([
      { detail: "Invalid value", pointer: "#/value" },
    ]);
  });

  test("restricts validation problem contracts to status 400", () => {
    type InvalidStatusDefinition = {
      readonly status: 500;
      readonly title: "Invalid status";
      readonly type: "https://api.example.com/problems/invalid-status";
    };

    // @ts-expect-error -- Zod validation problem contracts always use status 400.
    type InvalidStatusContract = ZodValidationProblemContract<InvalidStatusDefinition>;

    expectTypeOf<InvalidStatusContract>().toBeObject();
  });
});
