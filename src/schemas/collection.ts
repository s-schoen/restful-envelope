import { z } from "zod/v4";

import { createValidatedResourceSchema } from "./utils.js";

const collectionPaginationSchema = z.strictObject({
  offset: z.int().nonnegative(),
  limit: z.int().positive(),
  nextOffset: z.int().nonnegative().nullable(),
  total: z.int().nonnegative().optional(),
});

/**
 * Creates a strict schema for a response containing a page of resources.
 *
 * The resource schema must accept and produce an object. Pagination values must be safe integers,
 * and unknown top-level envelope and pagination members are rejected.
 */
export function createCollectionResponseSchema<
  const ResourceOutput extends object,
  const ResourceInput extends object,
>(resourceSchema: z.ZodType<ResourceOutput, ResourceInput>) {
  const validatedResourceSchema = createValidatedResourceSchema(resourceSchema);

  return z
    .strictObject({
      data: z.array(validatedResourceSchema),
      pagination: collectionPaginationSchema,
    })
    .superRefine((response, context) => {
      if (response.data.length > response.pagination.limit) {
        context.addIssue({
          code: "custom",
          message: "Page contains more resources than its pagination limit",
          path: ["data"],
        });
      }

      if (
        response.pagination.nextOffset !== null &&
        (response.data.length === 0 ||
          response.pagination.nextOffset !== response.pagination.offset + response.data.length)
      ) {
        context.addIssue({
          code: "custom",
          message: "Next offset must identify the first resource after this page",
          path: ["pagination", "nextOffset"],
        });
      }
    });
}
