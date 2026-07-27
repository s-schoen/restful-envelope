import { describe, expect, expectTypeOf, test } from "vitest";
import { z } from "zod/v4";

import { createProblemDetailsUnionSchema, defineProblemContract } from "./index.js";

describe("createProblemDetailsUnionSchema", () => {
  test("parses problem contracts as a discriminated union", () => {
    const validationProblem = defineProblemContract({
      type: "https://api.example.com/problems/validation",
      title: "Request validation failed",
      status: 422,
      extensions: { errors: z.array(z.string()) },
    });
    const conflictProblem = defineProblemContract({
      type: "https://api.example.com/problems/conflict",
      title: "Conflict",
      status: 409,
      extensions: { conflictingId: z.string() },
    });
    const problemSchema = createProblemDetailsUnionSchema(validationProblem, conflictProblem);

    const problem = problemSchema.parse({
      type: conflictProblem.type,
      title: conflictProblem.title,
      status: conflictProblem.status,
      conflictingId: "user-42",
    });

    if (problem.type !== conflictProblem.type) {
      throw new Error("Expected the conflict problem type.");
    }

    expect(problem.conflictingId).toBe("user-42");
    expectTypeOf(problem.conflictingId).toEqualTypeOf<string>();
  });

  test("rejects duplicate problem type URIs while creating the schema", () => {
    const firstProblem = defineProblemContract({
      type: "https://api.example.com/problems/duplicate",
      title: "First problem",
      status: 400,
    });
    const secondProblem = defineProblemContract({
      type: "https://api.example.com/problems/duplicate",
      title: "Second problem",
      status: 409,
    });

    expect(() => createProblemDetailsUnionSchema(firstProblem, firstProblem)).toThrow(
      'Duplicate problem type "https://api.example.com/problems/duplicate".',
    );
    expect(() => createProblemDetailsUnionSchema(firstProblem, secondProblem)).toThrow(TypeError);
  });

  test("rejects contract metadata that does not match its schema discriminator", () => {
    const problemContract = defineProblemContract({
      type: "https://api.example.com/problems/actual",
      title: "Actual problem",
      status: 400,
    });
    const mismatchedContract = {
      ...problemContract,
      type: "https://api.example.com/problems/mismatched" as const,
    };
    const mismatchedStatusContract = {
      ...problemContract,
      status: 409 as const,
    };

    expect(() => createProblemDetailsUnionSchema(mismatchedContract)).toThrow(
      'Problem contract type "https://api.example.com/problems/mismatched" does not match its schema.',
    );
    expect(() => createProblemDetailsUnionSchema(mismatchedStatusContract)).toThrow(
      "Problem contract status does not match its schema.",
    );
  });

  test("requires at least one problem contract", () => {
    expect(() => {
      // @ts-expect-error -- A discriminated union requires at least one problem contract.
      createProblemDetailsUnionSchema();
    }).toThrow("At least one problem contract is required.");
  });

  test("supports a single problem contract", () => {
    const notFoundProblem = defineProblemContract({
      type: "https://api.example.com/problems/not-found",
      title: "Resource not found",
      status: 404,
      extensions: { resourceId: z.string() },
    });
    const problemSchema = createProblemDetailsUnionSchema(notFoundProblem);

    const problem = problemSchema.parse({
      type: notFoundProblem.type,
      title: notFoundProblem.title,
      status: notFoundProblem.status,
      resourceId: "user-42",
    });

    expect(problem.resourceId).toBe("user-42");
    expectTypeOf(problem.resourceId).toEqualTypeOf<string>();
  });

  test("preserves contract inputs, outputs, localization, and unknown extensions", () => {
    const retryProblem = defineProblemContract({
      type: "https://api.example.com/problems/retry",
      title: "Retry later",
      status: 503,
      extensions: {
        retryAfter: z.string().transform(Number),
      },
    });
    const conflictProblem = defineProblemContract({
      type: "https://api.example.com/problems/conflict",
      title: "Conflict",
      status: 409,
    });
    const problemSchema = createProblemDetailsUnionSchema(retryProblem, conflictProblem);

    const problem = problemSchema.parse({
      type: retryProblem.type,
      title: "Spater erneut versuchen",
      status: retryProblem.status,
      retryAfter: "30",
      requestId: "request-123",
    });

    if (problem.type !== retryProblem.type) {
      throw new Error("Expected the retry problem type.");
    }

    type RetryInput = Extract<z.input<typeof problemSchema>, { type: typeof retryProblem.type }>;
    type RetryOutput = Extract<z.output<typeof problemSchema>, { type: typeof retryProblem.type }>;

    expect(problem.retryAfter).toBe(30);
    expect(problem.requestId).toBe("request-123");
    expect(Object.isFrozen(problem)).toBe(true);
    expectTypeOf<RetryInput["retryAfter"]>().toEqualTypeOf<string>();
    expectTypeOf<RetryOutput["retryAfter"]>().toEqualTypeOf<number>();
    expectTypeOf(problem.requestId).toBeUnknown();
  });

  test("rejects unknown and malformed known problem types", () => {
    const validationProblem = defineProblemContract({
      type: "https://api.example.com/problems/validation",
      title: "Request validation failed",
      status: 422,
      extensions: { errors: z.array(z.string()) },
    });
    const problemSchema = createProblemDetailsUnionSchema(validationProblem);

    expect(
      problemSchema.safeParse({
        type: "https://api.example.com/problems/unknown",
        title: "Unknown problem",
        status: 500,
      }).success,
    ).toBe(false);
    expect(
      problemSchema.safeParse({
        type: validationProblem.type,
        title: validationProblem.title,
        status: 400,
        errors: [],
      }).success,
    ).toBe(false);
    expect(
      problemSchema.safeParse({
        type: validationProblem.type,
        title: validationProblem.title,
        status: validationProblem.status,
      }).success,
    ).toBe(false);
  });

  test("supports asynchronous contracts without affecting synchronous branches", async () => {
    const asyncProblem = defineProblemContract({
      type: "https://api.example.com/problems/async",
      title: "Asynchronous problem",
      status: 500,
      extensions: {
        code: z.string().transform((value) => Promise.resolve(value.length)),
      },
    });
    const syncProblem = defineProblemContract({
      type: "https://api.example.com/problems/sync",
      title: "Synchronous problem",
      status: 400,
      extensions: { code: z.string() },
    });
    const problemSchema = createProblemDetailsUnionSchema(asyncProblem, syncProblem);

    const synchronousResult = problemSchema.parse({
      type: syncProblem.type,
      title: syncProblem.title,
      status: syncProblem.status,
      code: "sync",
    });
    const asynchronousResult = await problemSchema.parseAsync({
      type: asyncProblem.type,
      title: asyncProblem.title,
      status: asyncProblem.status,
      code: "three",
    });

    expect(synchronousResult.code).toBe("sync");
    expect(asynchronousResult.code).toBe(5);
  });
});
