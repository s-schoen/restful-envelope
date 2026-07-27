import { describe, expect, expectTypeOf, test } from "vitest";
import { z } from "zod/v4";

import { defineProblemContract } from "./index.js";

describe("defineProblemContract", () => {
  test("creates typed problem details from one schema-backed definition", () => {
    const validationProblem = defineProblemContract({
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
      detail: "The request contains invalid fields.",
      errors: [{ detail: "Must be positive", pointer: "#/age" }],
    });

    expect(problem).toEqual({
      type: "https://api.example.com/problems/validation",
      title: "Request validation failed",
      status: 422,
      detail: "The request contains invalid fields.",
      errors: [{ detail: "Must be positive", pointer: "#/age" }],
    });
    expect(Object.isFrozen(problem)).toBe(true);
    expect(Object.isFrozen(validationProblem)).toBe(true);
    expectTypeOf(
      validationProblem.type,
    ).toEqualTypeOf<"https://api.example.com/problems/validation">();
    expectTypeOf(validationProblem.status).toEqualTypeOf<422>();
    expectTypeOf(validationProblem.title).toEqualTypeOf<"Request validation failed">();
    expectTypeOf(problem.errors).toEqualTypeOf<{ detail: string; pointer: string }[]>();
  });

  test("applies extension defaults and transforms during creation", () => {
    const retryProblem = defineProblemContract({
      type: "https://api.example.com/problems/retry",
      title: "Retry later",
      status: 503,
      extensions: {
        retryAfter: z.string().transform(Number).default(30),
      },
    });

    const defaultProblem = retryProblem.create();
    const transformedProblem = retryProblem.create({ retryAfter: "45" });
    const parsedProblem = retryProblem.schema.parse({
      type: retryProblem.type,
      title: retryProblem.title,
      status: retryProblem.status,
      retryAfter: "60",
    });

    expect(defaultProblem.retryAfter).toBe(30);
    expect(transformedProblem.retryAfter).toBe(45);
    expect(parsedProblem.retryAfter).toBe(60);
    expectTypeOf(defaultProblem.retryAfter).toEqualTypeOf<number>();
    expect(() => {
      // @ts-expect-error -- Creation accepts the extension schema's input type, not its output type.
      retryProblem.create({ retryAfter: 45 });
    }).toThrow(z.ZodError);
  });

  test("parses localized responses and preserves undeclared extensions", () => {
    const validationProblem = defineProblemContract({
      type: "https://api.example.com/problems/validation",
      title: "Request validation failed",
      status: 422,
      extensions: {
        errors: z.array(z.object({ pointer: z.string() })),
      },
    });

    const problem = validationProblem.schema.parse({
      type: "https://api.example.com/problems/validation",
      title: "Validierung der Anfrage fehlgeschlagen",
      status: 422,
      errors: [{ pointer: "#/age" }],
      requestId: "request-123",
    });

    expect(problem).toEqual({
      type: "https://api.example.com/problems/validation",
      title: "Validierung der Anfrage fehlgeschlagen",
      status: 422,
      errors: [{ pointer: "#/age" }],
      requestId: "request-123",
    });
    expect(Object.isFrozen(problem)).toBe(true);
    expectTypeOf(problem.type).toEqualTypeOf<"https://api.example.com/problems/validation">();
    expectTypeOf(problem.status).toEqualTypeOf<422>();
    expectTypeOf(problem.title).toEqualTypeOf<string>();
    expectTypeOf(problem.requestId).toBeUnknown();
  });

  test("rejects values outside the declared producer and response contracts", () => {
    const validationProblem = defineProblemContract({
      type: "https://api.example.com/problems/validation",
      title: "Request validation failed",
      status: 422,
      extensions: {
        errors: z.array(z.object({ pointer: z.string() })),
      },
    });

    expect(() => {
      validationProblem.create({
        errors: [],
        // @ts-expect-error -- Creation rejects extension members absent from the contract.
        requestId: "request-123",
      });
    }).toThrow(z.ZodError);
    expect(() => {
      validationProblem.create({
        errors: [],
        // @ts-expect-error -- Stable problem metadata cannot be supplied per occurrence.
        status: 500,
      });
    }).toThrow(z.ZodError);
    expect(
      validationProblem.schema.safeParse({
        type: "https://api.example.com/problems/other",
        title: "Request validation failed",
        status: 422,
        errors: [],
      }).success,
    ).toBe(false);
    expect(
      validationProblem.schema.safeParse({
        type: "https://api.example.com/problems/validation",
        title: "Request validation failed",
        status: 400,
        errors: [],
      }).success,
    ).toBe(false);
    expect(
      validationProblem.schema.safeParse({
        type: "https://api.example.com/problems/validation",
        title: "",
        status: 422,
        errors: [],
      }).success,
    ).toBe(false);
  });

  test.each(["detail", "instance", "status", "title", "type"])(
    "rejects standard Problem Details member %s in the extension shape",
    (member) => {
      expect(() => {
        Reflect.apply(defineProblemContract, undefined, [
          {
            type: "https://api.example.com/problems/invalid",
            title: "Invalid contract",
            status: 500,
            extensions: { [member]: z.unknown() },
          },
        ]);
      }).toThrow(TypeError);
    },
  );

  test("rejects reserved extension members at compile time", () => {
    const validDefinition: Parameters<typeof defineProblemContract>[0] = {
      type: "https://api.example.com/problems/valid",
      title: "Valid contract",
      status: 400,
      extensions: { code: z.string() },
    };
    expect(validDefinition.extensions).toHaveProperty("code");
    expect(() => {
      defineProblemContract({
        type: "https://api.example.com/problems/invalid",
        title: "Invalid contract",
        status: 500,
        // @ts-expect-error -- Standard Problem Details members cannot be redefined as extensions.
        extensions: { status: z.literal(500) },
      });
    }).toThrow(TypeError);
  });

  test("rejects unsupported definition properties at compile time", () => {
    const problemContract = defineProblemContract({
      type: "https://api.example.com/problems/example",
      title: "Example problem",
      status: 400,
      // @ts-expect-error -- The contract definition only accepts documented configuration fields.
      unexpected: true,
    });

    expect(problemContract.type).toBe("https://api.example.com/problems/example");
  });

  test("validates contract definitions and occurrence URI references", () => {
    expect(() =>
      defineProblemContract({
        type: "contains whitespace",
        title: "Invalid type",
        status: 500,
      }),
    ).toThrow(TypeError);
    expect(() =>
      defineProblemContract({
        type: "https://api.example.com/problems/empty-title",
        title: "",
        status: 500,
      }),
    ).toThrow(TypeError);
    expect(() =>
      defineProblemContract({
        type: "https://api.example.com/problems/invalid-status",
        title: "Invalid status",
        status: 600,
      }),
    ).toThrow(RangeError);

    const problemContract = defineProblemContract({
      type: "https://api.example.com/problems/example",
      title: "Example problem",
      status: 400,
    });

    expect(() => problemContract.create({ instance: "contains whitespace" })).toThrow(z.ZodError);
  });

  test("copies the definition and extension shape", () => {
    const extensions = { code: z.string() };
    const definition = {
      type: "https://api.example.com/problems/example",
      title: "Example problem",
      status: 400,
      extensions,
    };
    const problemContract = defineProblemContract(definition);

    definition.type = "https://api.example.com/problems/changed";
    definition.title = "Changed problem";
    definition.status = 500;
    extensions.code = z.string().length(100);

    expect(problemContract.create({ code: "original" })).toEqual({
      type: "https://api.example.com/problems/example",
      title: "Example problem",
      status: 400,
      code: "original",
    });
  });

  test("composes contract schemas as a discriminated union", () => {
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
    const problemCatalogSchema = z.discriminatedUnion("type", [
      validationProblem.schema,
      conflictProblem.schema,
    ]);

    const problem = problemCatalogSchema.parse({
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

  test("keeps asynchronous schemas on the parser interface", async () => {
    const asyncProblem = defineProblemContract({
      type: "https://api.example.com/problems/async",
      title: "Asynchronous problem",
      status: 500,
      extensions: {
        code: z.string().transform((value) => Promise.resolve(value.length)),
      },
    });

    expect(() => asyncProblem.create({ code: "three" })).toThrow(TypeError);

    const problem = await asyncProblem.schema.parseAsync({
      type: asyncProblem.type,
      title: asyncProblem.title,
      status: asyncProblem.status,
      code: "three",
    });

    expect(problem.code).toBe(5);
  });
});
