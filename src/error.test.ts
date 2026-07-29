import { describe, expect, expectTypeOf, test } from "vitest";

import {
  ABOUT_BLANK_PROBLEM_TYPE,
  badRequestProblem,
  conflictProblem,
  defineProblemType,
  forbiddenProblem,
  internalServerErrorProblem,
  methodNotAllowedProblem,
  notFoundProblem,
  type ProblemDetails,
  type ProblemType,
  unauthorizedProblem,
  unsupportedMediaTypeProblem,
} from "./index.js";

const defaultProblemCases = [
  { problemType: badRequestProblem, status: 400, title: "Bad Request" },
  { problemType: unauthorizedProblem, status: 401, title: "Unauthorized" },
  { problemType: forbiddenProblem, status: 403, title: "Forbidden" },
  { problemType: notFoundProblem, status: 404, title: "Not Found" },
  { problemType: methodNotAllowedProblem, status: 405, title: "Method Not Allowed" },
  { problemType: conflictProblem, status: 409, title: "Conflict" },
  {
    problemType: unsupportedMediaTypeProblem,
    status: 415,
    title: "Unsupported Media Type",
  },
  {
    problemType: internalServerErrorProblem,
    status: 500,
    title: "Internal Server Error",
  },
] as const;

describe("defineProblemType", () => {
  test.each(defaultProblemCases)(
    "creates the default $status problem",
    ({ problemType, ...expected }) => {
      expect(problemType.create()).toEqual({
        type: ABOUT_BLANK_PROBLEM_TYPE,
        ...expected,
      });
    },
  );

  test("preserves default problem status literals", () => {
    expectTypeOf(badRequestProblem.create().status).toEqualTypeOf<400>();
    expectTypeOf(unauthorizedProblem.create().status).toEqualTypeOf<401>();
    expectTypeOf(forbiddenProblem.create().status).toEqualTypeOf<403>();
    expectTypeOf(notFoundProblem.create().status).toEqualTypeOf<404>();
    expectTypeOf(methodNotAllowedProblem.create().status).toEqualTypeOf<405>();
    expectTypeOf(conflictProblem.create().status).toEqualTypeOf<409>();
    expectTypeOf(unsupportedMediaTypeProblem.create().status).toEqualTypeOf<415>();
    expectTypeOf(internalServerErrorProblem.create().status).toEqualTypeOf<500>();
    expectTypeOf(conflictProblem.create().title).toEqualTypeOf<"Conflict">();
  });

  test("creates immutable problem details", () => {
    const problem = notFoundProblem.create({
      detail: "No customer exists with that identifier.",
      instance: "urn:uuid:123e4567-e89b-12d3-a456-426614174000",
    });

    expect(problem).toEqual({
      type: ABOUT_BLANK_PROBLEM_TYPE,
      title: "Not Found",
      status: 404,
      detail: "No customer exists with that identifier.",
      instance: "urn:uuid:123e4567-e89b-12d3-a456-426614174000",
    });
    expect(Object.isFrozen(problem)).toBe(true);
    expect(Object.isFrozen(notFoundProblem)).toBe(true);
  });

  test("captures an immutable copy of the definition", () => {
    const definition = {
      type: "https://api.example.com/problems/conflict",
      title: "Conflict",
      status: 409,
    };
    const conflictProblem = defineProblemType(definition);

    definition.title = "Changed";
    definition.status = 200;

    expect(conflictProblem.create()).toEqual({
      type: "https://api.example.com/problems/conflict",
      title: "Conflict",
      status: 409,
    });
  });

  test.each([99, 600, 400.5])("rejects invalid HTTP status %s", (status) => {
    expect(() =>
      defineProblemType({
        type: "https://api.example.com/problems/invalid-status",
        title: "Invalid status",
        status,
      }),
    ).toThrow(RangeError);
  });

  test("rejects an empty title", () => {
    expect(() =>
      defineProblemType({
        type: "https://api.example.com/problems/missing-title",
        title: "",
        status: 500,
      }),
    ).toThrow(TypeError);
  });

  test("preserves required extension types", () => {
    interface ValidationIssue {
      detail: string;
      pointer: string;
    }

    const validationProblem = defineProblemType<{ errors: ValidationIssue[] }>({
      type: "https://api.example.com/problems/validation",
      title: "Request validation failed",
      status: 422,
    });
    const problem = validationProblem.create({
      errors: [{ detail: "Must be positive", pointer: "#/age" }],
    });

    expect(problem.errors).toEqual([{ detail: "Must be positive", pointer: "#/age" }]);
    expectTypeOf(problem.errors).toEqualTypeOf<ValidationIssue[]>();
    expectTypeOf(validationProblem).toEqualTypeOf<ProblemType<{ errors: ValidationIssue[] }>>();

    // @ts-expect-error -- The declared errors extension is required for every occurrence.
    validationProblem.create({});
    // @ts-expect-error -- Stable definition members cannot be overridden per occurrence.
    notFoundProblem.create({ status: 200 });
    // @ts-expect-error -- Undeclared extension members are rejected.
    notFoundProblem.create({ errors: [] });
  });

  test("allows extension values without constraining their representation", () => {
    const callbackProblem = defineProblemType<{ callback: () => void }>({
      type: "https://api.example.com/problems/callback",
      title: "Callback",
      status: 500,
    });
    const callback = () => undefined;
    const problem = callbackProblem.create({ callback });

    expect(problem.callback).toBe(callback);
    expectTypeOf(problem.callback).toEqualTypeOf<() => void>();
  });

  test("requires the package's core problem members", () => {
    const problem = {
      type: "about:blank",
      title: "Bad Request",
      status: 400,
    } satisfies ProblemDetails;

    expect(problem).toEqual({
      type: "about:blank",
      title: "Bad Request",
      status: 400,
    });

    // @ts-expect-error -- The package profile requires type, title, and status.
    const incompleteProblem: ProblemDetails = {};
    expect(incompleteProblem).toEqual({});
  });
});
