import { z } from "zod/v4";

import { defineProblemType } from "../error.js";
import type { ProblemTypeDefinition } from "../error.js";

type EmptyProblemExtensionShape = Readonly<Record<never, never>>;
type ProblemExtensionShape = z.core.$ZodShape;
type StandardProblemDetailsMember = "detail" | "instance" | "status" | "title" | "type";

type ProblemExtensionShapeArgument<Shape extends ProblemExtensionShape> = Shape &
  Partial<Record<StandardProblemDetailsMember, never>>;

type ProblemExtensionInput<Shape extends ProblemExtensionShape> = keyof Shape extends never
  ? Record<never, never>
  : z.input<z.ZodObject<Shape>>;
type ProblemExtensionOutput<Shape extends ProblemExtensionShape> = keyof Shape extends never
  ? Record<never, never>
  : z.output<z.ZodObject<Shape>>;

type ProblemContractOccurrence<Shape extends ProblemExtensionShape> = Readonly<
  ProblemExtensionInput<Shape> & {
    detail?: string;
    instance?: string;
    status?: never;
    title?: never;
    type?: never;
  }
>;

type CreateProblemContractArguments<Shape extends ProblemExtensionShape> =
  Record<never, never> extends ProblemExtensionInput<Shape>
    ? [occurrence?: ProblemContractOccurrence<Shape>]
    : [occurrence: ProblemContractOccurrence<Shape>];

type CreatedProblemContractDetails<
  Definition extends ProblemTypeDefinition,
  Shape extends ProblemExtensionShape,
> = Readonly<
  ProblemExtensionOutput<Shape> & {
    detail?: string;
    instance?: string;
    status: Definition["status"];
    title: Definition["title"];
    type: Definition["type"];
  }
>;

type ProblemContractSchemaShape<
  Definition extends ProblemTypeDefinition,
  Shape extends ProblemExtensionShape,
> = Shape & {
  detail: z.ZodOptional<z.ZodString>;
  instance: z.ZodOptional<z.ZodString>;
  status: z.ZodLiteral<Definition["status"]>;
  title: z.ZodString;
  type: z.ZodLiteral<Definition["type"]>;
};

type ProblemContractSchema<
  Definition extends ProblemTypeDefinition,
  Shape extends ProblemExtensionShape,
> = z.ZodReadonly<
  z.ZodObject<ProblemContractSchemaShape<Definition, Shape>, z.core.$catchall<z.ZodUnknown>>
>;

type ProblemContractDefinition<
  Type extends string,
  Title extends string,
  Status extends number,
  Shape extends ProblemExtensionShape,
> = {
  extensions?: ProblemExtensionShapeArgument<Shape>;
  status: Status;
  title: Title;
  type: Type;
};

type FixedProblemTypeDefinition<
  Type extends string,
  Title extends string,
  Status extends number,
> = Readonly<{
  status: Status;
  title: Title;
  type: Type;
}>;

/** A reusable Problem Details definition paired with its runtime schema. */
export interface ProblemContract<
  Definition extends ProblemTypeDefinition = ProblemTypeDefinition,
  Shape extends ProblemExtensionShape = EmptyProblemExtensionShape,
> {
  /** Parses responses for this problem type while preserving undeclared extensions as `unknown`. */
  readonly schema: ProblemContractSchema<Definition, Shape>;

  /** The HTTP response status used for this problem type. */
  readonly status: Definition["status"];

  /** The canonical title emitted by {@link ProblemContract.create}. */
  readonly title: Definition["title"];

  /** The URI reference identifying this problem type. */
  readonly type: Definition["type"];

  /** Validates occurrence-specific values and creates immutable Problem Details. */
  create(
    ...arguments_: CreateProblemContractArguments<Shape>
  ): CreatedProblemContractDetails<Definition, Shape>;
}

const URI_REFERENCE_CHARACTERS = /^(?:[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=]|%[A-Fa-f0-9]{2})*$/u;
const URI_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*$/u;

function isUriReference(value: string): boolean {
  if (!URI_REFERENCE_CHARACTERS.test(value) || value.indexOf("#") !== value.lastIndexOf("#")) {
    return false;
  }

  const delimiterIndex = value.search(/[/?#]/u);
  const firstSegment = value.slice(0, delimiterIndex === -1 ? value.length : delimiterIndex);
  const colonIndex = firstSegment.indexOf(":");

  return colonIndex === -1 || URI_SCHEME.test(firstSegment.slice(0, colonIndex));
}

const uriReferenceSchema = z.string().refine(isUriReference, "Invalid URI reference");

const httpStatusSchema = z
  .number()
  .int()
  .min(100, "HTTP status must be at least 100")
  .max(599, "HTTP status must be at most 599");

const STANDARD_PROBLEM_DETAILS_MEMBERS = ["detail", "instance", "status", "title", "type"] as const;

/**
 * Validates a Problem Details response while preserving undeclared extension members as `unknown`.
 *
 * Use `safeExtend()` to validate and infer extensions for a specific problem type. Narrowing
 * `type` to its literal URI also makes the parsed result suitable for discriminating problem
 * types.
 *
 * @example
 * ```ts
 * import { z } from "zod/v4";
 * import { problemDetailsSchema } from "@s-schoen/restful-envelope/schemas";
 *
 * const validationProblemSchema = problemDetailsSchema.safeExtend({
 *   type: z.literal("https://api.example.com/problems/validation"),
 *   errors: z.array(
 *     z.object({
 *       detail: z.string(),
 *       pointer: z.string(),
 *     }),
 *   ),
 * });
 *
 * const result = validationProblemSchema.safeParse(await response.json());
 *
 * if (result.success) {
 *   result.data.errors[0]?.pointer; // string | undefined
 * }
 * ```
 */
export const problemDetailsSchema = z
  .object({
    type: uriReferenceSchema,
    title: z.string(),
    status: httpStatusSchema,
    detail: z.string().optional(),
    instance: uriReferenceSchema.optional(),
  })
  .catchall(z.unknown());

/**
 * Defines a Problem Details type together with schemas for its extension members.
 *
 * Creation validates synchronously and rejects undeclared members. The response schema preserves
 * undeclared extension members as `unknown` for forward-compatible parsing, accepts localized
 * nonempty titles, and requires the definition's exact `type` and `status`.
 *
 * @example
 * ```ts
 * import { z } from "zod/v4";
 * import { defineProblemContract } from "@s-schoen/restful-envelope/schemas";
 *
 * const validationProblem = defineProblemContract({
 *   type: "https://api.example.com/problems/validation",
 *   title: "Request validation failed",
 *   status: 422,
 *   extensions: {
 *     errors: z.array(z.object({ detail: z.string(), pointer: z.string() })),
 *   },
 * });
 *
 * const problem = validationProblem.create({
 *   errors: [{ detail: "Must be positive", pointer: "#/age" }],
 * });
 * ```
 *
 * @throws {TypeError} When `type` is not a URI reference, `title` is empty, or an extension
 * redefines a standard Problem Details member.
 * @throws {RangeError} When `status` is not an integer between 100 and 599.
 */
export function defineProblemContract<
  const Type extends string,
  const Title extends string,
  const Status extends number,
  const Shape extends ProblemExtensionShape = EmptyProblemExtensionShape,
>(
  definition: ProblemContractDefinition<Type, Title, Status, Shape>,
): ProblemContract<FixedProblemTypeDefinition<Type, Title, Status>, Shape>;
export function defineProblemContract(
  definition: ProblemTypeDefinition & { extensions?: ProblemExtensionShape },
) {
  if (!isUriReference(definition.type)) {
    throw new TypeError("Problem type must be a valid URI reference.");
  }

  const extensionShape = { ...definition.extensions };

  for (const member of STANDARD_PROBLEM_DETAILS_MEMBERS) {
    if (Object.hasOwn(extensionShape, member)) {
      throw new TypeError(`Problem extensions must not redefine the standard member "${member}".`);
    }
  }

  const fixedDefinition = {
    type: definition.type,
    title: definition.title,
    status: definition.status,
  };
  const fixedProblem = defineProblemType(fixedDefinition).create();
  const occurrenceSchema = z.strictObject({
    ...extensionShape,
    detail: z.string().optional(),
    instance: uriReferenceSchema.optional(),
  });
  const schema = z
    .object({
      ...extensionShape,
      detail: z.string().optional(),
      instance: uriReferenceSchema.optional(),
      status: z.literal(fixedDefinition.status),
      title: z.string().nonempty("Problem title must not be empty"),
      type: z.literal(fixedDefinition.type),
    })
    .catchall(z.unknown())
    .readonly();

  return Object.freeze({
    ...fixedDefinition,
    schema,
    create(occurrence: Readonly<Record<string, unknown>> = {}) {
      return Object.freeze(Object.assign({}, occurrenceSchema.parse(occurrence), fixedProblem));
    },
  });
}
