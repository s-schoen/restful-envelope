import { describe, expect, expectTypeOf, test } from "vitest";
import { z } from "zod/v4";

import { identifierSchema } from "./index.js";

type ParsedIdentifier = z.output<typeof identifierSchema>;

describe("identifierSchema", () => {
  test.each(["users/OIL-~", "10-0", "12--34", "12-345-67", "U234", "1-users/ABC123"])(
    "accepts identifier string %s",
    (identifier) => {
      expect(identifierSchema.parse(identifier)).toBe(identifier);
    },
  );

  test.each([42, "", "/1234", "Users/1234", "users//1234", "users/", "1234!", "12~34", "ſ234"])(
    "rejects invalid identifier %#",
    (identifier) => {
      expect(identifierSchema.safeParse(identifier).success).toBe(false);
    },
  );

  test("infers a string output", () => {
    expectTypeOf<ParsedIdentifier>().toEqualTypeOf<string>();
  });
});
