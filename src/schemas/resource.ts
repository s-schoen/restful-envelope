import { z } from "zod/v4";

import { createValidatedResourceSchema } from "./utils.js";

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
  const validatedResourceSchema = createValidatedResourceSchema(resourceSchema);

  return z.strictObject({ data: validatedResourceSchema });
}
