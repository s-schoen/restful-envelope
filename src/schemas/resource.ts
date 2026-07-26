import { z } from "zod/v4";

function isResourceObject(value: unknown): value is object {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Creates a strict schema for a response containing one resource.
 *
 * The resource schema must accept and produce an object. Unknown top-level envelope members and
 * non-object resource values are rejected.
 */
export function createResourceResponseSchema<
  const ResourceOutput extends object,
  const ResourceInput extends object,
>(resourceSchema: z.ZodType<ResourceOutput, ResourceInput>) {
  const validatedResourceSchema = z
    .custom<ResourceInput>(isResourceObject, "Expected resource object")
    .pipe(resourceSchema)
    .refine((value) => isResourceObject(value), "Expected resource object");

  return z.strictObject({ data: validatedResourceSchema });
}
