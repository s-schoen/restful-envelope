/** The RFC 9457 problem type used when an error has no semantics beyond its HTTP status. */
export const ABOUT_BLANK_PROBLEM_TYPE = "about:blank";

/** The media type for an RFC 9457 Problem Details JSON response. */
export const PROBLEM_JSON_MEDIA_TYPE = "application/problem+json";

type EmptyProblemExtensions = Record<never, never>;

type StandardProblemDetailsMember = "detail" | "instance" | "status" | "title" | "type";

type ProblemExtensionMembers<Extensions extends object> = Omit<
  Extensions,
  StandardProblemDetailsMember
>;

/** Stable metadata shared by every occurrence of a problem type. */
export interface ProblemTypeDefinition {
  /** A stable URI reference that identifies and preferably documents the problem type. */
  readonly type: string;

  /** A short summary that remains stable across occurrences, except for localization. */
  readonly title: string;

  /** The HTTP response status used for occurrences of this problem type. */
  readonly status: number;
}

/**
 * The wire representation of an RFC 9457 Problem Details response.
 *
 * Pass an extension object type to describe additional top-level members; without one,
 * additional members are exposed as `unknown`.
 *
 * @template Extensions - Additional top-level members defined by the problem type.
 */
export type ProblemDetails<Extensions extends object = Record<string, unknown>> = Readonly<
  {
    /** A URI reference identifying the problem type. */
    type: string;

    /** A short, human-readable summary of the problem type. */
    title: string;

    /** The status code that must also be used by the HTTP response. */
    status: number;

    /** A human-readable explanation specific to this occurrence. */
    detail?: string;

    /** A URI reference identifying this specific occurrence. */
    instance?: string;
  } & ProblemExtensionMembers<Extensions>
>;

/**
 * Occurrence-specific values accepted by {@link ProblemType.create}.
 *
 * Stable `type`, `title`, and `status` values come from the problem type definition and cannot be
 * supplied here.
 *
 * @template Extensions - Additional top-level members required by the problem type.
 */
export type ProblemOccurrence<Extensions extends object = EmptyProblemExtensions> = Readonly<
  {
    /** A human-readable explanation specific to this occurrence. */
    detail?: string;

    /** A URI reference identifying this specific occurrence. */
    instance?: string;
  } & ProblemExtensionMembers<Extensions>
>;

/**
 * Problem Details produced from a definition and its occurrence-specific values.
 *
 * This is the return type of {@link ProblemType.create}; its default extension shape contains no
 * additional members.
 *
 * @template Extensions - Additional top-level members defined by the problem type.
 */
export type CreatedProblemDetails<Extensions extends object = EmptyProblemExtensions> = Readonly<
  ProblemTypeDefinition & ProblemOccurrence<Extensions>
>;

type CreateProblemArguments<Extensions extends object> =
  keyof ProblemExtensionMembers<Extensions> extends never
    ? [occurrence?: ProblemOccurrence<Extensions>]
    : [occurrence: ProblemOccurrence<Extensions>];

/**
 * An immutable, reusable definition that creates occurrences of one problem type.
 *
 * @template Extensions - Additional top-level members accepted by `create`.
 */
export interface ProblemType<Extensions extends object = EmptyProblemExtensions> {
  /**
   * Combines occurrence-specific values with the stable problem type definition.
   *
   * The returned object is shallow-frozen. Extension values are retained as supplied and remain
   * the caller's responsibility.
   */
  create(...arguments_: CreateProblemArguments<Extensions>): CreatedProblemDetails<Extensions>;
}

/**
 * Defines an immutable, reusable RFC 9457 problem type.
 *
 * Use the generic parameter to declare additional top-level members. The returned definition can
 * then create many occurrences while keeping `type`, `title`, and `status` consistent.
 *
 * @example
 * ```ts
 * const validationProblem = defineProblemType<{ errors: string[] }>({
 *   type: "https://api.example.com/problems/validation",
 *   title: "Request validation failed",
 *   status: 422,
 * });
 *
 * const problem = validationProblem.create({
 *   detail: "Two fields are invalid.",
 *   errors: ["email", "name"],
 * });
 * ```
 *
 * @throws {RangeError} When `status` is not an integer between 100 and 599.
 * @throws {TypeError} When `title` is empty.
 */
export function defineProblemType<Extensions extends object = EmptyProblemExtensions>(
  definition: ProblemTypeDefinition,
): ProblemType<Extensions> {
  if (!Number.isInteger(definition.status) || definition.status < 100 || definition.status > 599) {
    throw new RangeError("Problem type status must be an integer between 100 and 599.");
  }

  if (definition.title.length === 0) {
    throw new TypeError("Problem type title must not be empty.");
  }

  const fixedDefinition = Object.freeze({ ...definition });

  return Object.freeze({
    create(...arguments_: CreateProblemArguments<Extensions>): CreatedProblemDetails<Extensions> {
      return Object.freeze(Object.assign({}, arguments_[0], fixedDefinition));
    },
  });
}

/** A reusable `400 Bad Request` problem using the `about:blank` problem type. */
export const badRequestProblem = defineProblemType({
  type: ABOUT_BLANK_PROBLEM_TYPE,
  title: "Bad Request",
  status: 400,
});

/** A reusable `404 Not Found` problem using the `about:blank` problem type. */
export const notFoundProblem = defineProblemType({
  type: ABOUT_BLANK_PROBLEM_TYPE,
  title: "Not Found",
  status: 404,
});

/** A reusable `500 Internal Server Error` problem using the `about:blank` problem type. */
export const internalServerErrorProblem = defineProblemType({
  type: ABOUT_BLANK_PROBLEM_TYPE,
  title: "Internal Server Error",
  status: 500,
});
