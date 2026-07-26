import { describe, expect, expectTypeOf, test } from "vitest";
import { z } from "zod/v4";

import { createResourceResponseSchema } from "./index.js";

const userSchema = z.object({
  id: z.string(),
  name: z.string(),
});

describe("createResourceResponseSchema", () => {
  test("validates a resource response and infers its data", () => {
    const schema = createResourceResponseSchema(userSchema);
    const response = schema.parse({
      data: { id: "user-42", name: "Ada" },
    });

    expect(response).toEqual({
      data: { id: "user-42", name: "Ada" },
    });
    expectTypeOf(response).toEqualTypeOf<{
      data: { id: string; name: string };
    }>();
    expectTypeOf<z.input<typeof schema>>().toEqualTypeOf<{
      data: { id: string; name: string };
    }>();
  });

  test("supports object-preserving schema transforms", () => {
    const schema = createResourceResponseSchema(
      userSchema.transform((user) => ({ ...user, name: user.name.trim() })),
    );

    expect(schema.parse({ data: { id: "user-42", name: "  Ada  " } })).toEqual({
      data: { id: "user-42", name: "Ada" },
    });
  });

  test("supports polymorphic resource schemas", () => {
    const schema = createResourceResponseSchema(
      z.discriminatedUnion("type", [
        z.object({ type: z.literal("person"), name: z.string() }),
        z.object({ type: z.literal("service"), endpoint: z.string() }),
      ]),
    );
    const response = schema.parse({
      data: { type: "service", endpoint: "/health" },
    });

    expect(response).toEqual({
      data: { type: "service", endpoint: "/health" },
    });
    expectTypeOf(response.data).toEqualTypeOf<
      { type: "person"; name: string } | { type: "service"; endpoint: string }
    >();
  });

  test.each([
    {},
    { data: null },
    { data: "user-42" },
    { data: { id: "user-42", name: "Ada" }, meta: {} },
  ])("rejects invalid response %#", (response) => {
    const schema = createResourceResponseSchema(userSchema);

    expect(schema.safeParse(response).success).toBe(false);
  });

  test("rejects arrays before and after resource parsing", () => {
    const arraySchema = createResourceResponseSchema(z.array(z.string()));
    const arrayOutputSchema = createResourceResponseSchema(
      z.object({ id: z.string() }).transform(({ id }) => [id]),
    );

    expect(arraySchema.safeParse({ data: ["user-42"] }).success).toBe(false);
    expect(arrayOutputSchema.safeParse({ data: { id: "user-42" } }).success).toBe(false);
  });

  test("requires schemas with object input and output types", () => {
    // @ts-expect-error -- A scalar schema cannot represent resource data.
    createResourceResponseSchema(z.string());
    // @ts-expect-error -- Resource data must be an object before parsing.
    createResourceResponseSchema(z.string().transform((id) => ({ id })));
    // @ts-expect-error -- Resource data must remain an object after parsing.
    createResourceResponseSchema(userSchema.transform(({ id }) => id));

    expect(true).toBe(true);
  });
});
