import { z } from "zod/v4";

const healthStatusSchema = z.enum(["healthy", "unhealthy", "degraded"]);

const componentHealthStatusSchema = z.object({
  name: z.string(),
  status: healthStatusSchema,
  detail: z.string().optional(),
});

/**
 * Validates a health response and its optional service identifier and component health details.
 */
export const healthResponseSchema = z.object({
  status: healthStatusSchema,
  service: z.string().optional(),
  components: z.array(componentHealthStatusSchema).optional(),
});
