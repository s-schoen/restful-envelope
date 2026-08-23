import { z } from "zod/v4";

/** Validates the structure of an identifier string with an optional collection prefix. */
export const identifierSchema = z.string().regex(/^([a-z0-9-]+\/)?[a-zA-Z0-9-]+[a-zA-Z0-9*~$=]?$/);
