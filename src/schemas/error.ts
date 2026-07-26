import { z } from "zod/v4";

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
