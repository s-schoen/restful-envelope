import { z } from "zod/v4";

import type { ProblemOccurrence, ProblemTypeDefinition } from "../error.js";
import { defineProblemContract } from "./error.js";
import type { ProblemContract } from "./error.js";

const zodValidationIssueSchema = z.object({
  detail: z.string(),
  pointer: z.string().optional(),
});

const zodValidationProblemExtensionShape = {
  errors: z.array(zodValidationIssueSchema),
};

type ZodValidationProblemExtensionShape = typeof zodValidationProblemExtensionShape;

type FixedZodValidationProblemDefinition<Type extends string, Title extends string> = Readonly<{
  status: 400;
  title: Title;
  type: Type;
}>;

type ZodValidationProblemDetails<Definition extends ProblemTypeDefinition> = ReturnType<
  ProblemContract<Definition, ZodValidationProblemExtensionShape>["create"]
>;

/** One request validation issue exposed by a Zod validation problem. */
export type ZodValidationIssue = z.output<typeof zodValidationIssueSchema>;

/** A schema-backed `400 Bad Request` problem contract that can consume Zod errors. */
export interface ZodValidationProblemContract<
  Definition extends ProblemTypeDefinition & { status: 400 } = ProblemTypeDefinition & {
    status: 400;
  },
> extends ProblemContract<Definition, ZodValidationProblemExtensionShape> {
  /** Converts a Zod error into an occurrence of this problem type. */
  createFromZodError(
    error: z.core.$ZodError,
    occurrence?: ProblemOccurrence,
  ): ZodValidationProblemDetails<Definition>;
}

function createJsonPointer(path: PropertyKey[]): string | undefined {
  if (path.some((segment) => typeof segment === "symbol")) {
    return undefined;
  }

  const encodedSegments: string[] = [];

  for (const segment of path) {
    const escapedSegment = String(segment).replaceAll("~", "~0").replaceAll("/", "~1");

    try {
      encodedSegments.push(encodeURIComponent(escapedSegment));
    } catch {
      return undefined;
    }
  }

  return encodedSegments.length === 0 ? "#" : `#/${encodedSegments.join("/")}`;
}

/**
 * Defines a schema-backed `400 Bad Request` problem that converts Zod validation errors.
 *
 * Each Zod issue becomes an `errors` entry whose pointer is relative to the value that Zod parsed.
 *
 * @example
 * ```ts
 * const requestValidationProblem = defineZodValidationProblemContract({
 *   type: "https://api.example.com/problems/request-validation",
 *   title: "Request validation failed",
 * });
 *
 * const problem = requestValidationProblem.createFromZodError(result.error);
 * ```
 */
export function defineZodValidationProblemContract<
  const Type extends string,
  const Title extends string,
>(definition: {
  type: Type;
  title: Title;
}): ZodValidationProblemContract<FixedZodValidationProblemDefinition<Type, Title>>;
export function defineZodValidationProblemContract(definition: { type: string; title: string }) {
  const contract = defineProblemContract({
    ...definition,
    status: 400,
    extensions: zodValidationProblemExtensionShape,
  });

  return Object.freeze({
    ...contract,
    createFromZodError(error: z.core.$ZodError, occurrence: ProblemOccurrence = {}) {
      const errors = error.issues.map((issue): ZodValidationIssue => {
        const pointer = createJsonPointer(issue.path);

        return pointer === undefined
          ? { detail: issue.message }
          : { detail: issue.message, pointer };
      });

      return contract.create({ ...occurrence, errors });
    },
  });
}
