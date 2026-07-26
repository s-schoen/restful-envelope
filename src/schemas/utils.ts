import { z } from "zod/v4";

function isResourceObject(value: unknown): value is object {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createValidatedResourceSchema<
  const ResourceOutput extends object,
  const ResourceInput extends object,
>(resourceSchema: z.ZodType<ResourceOutput, ResourceInput>) {
  return z
    .custom<ResourceInput>(isResourceObject, "Expected resource object")
    .pipe(resourceSchema)
    .refine((value) => isResourceObject(value), "Expected resource object");
}
