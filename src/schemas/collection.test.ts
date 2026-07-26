import { describe, expect, expectTypeOf, test } from "vitest";
import { z } from "zod/v4";

import { createCollectionResponseSchema } from "./index.js";

const userSchema = z.object({
  id: z.string(),
  name: z.string(),
});

describe("createCollectionResponseSchema", () => {
  test("validates a collection response and infers its resources", () => {
    const schema = createCollectionResponseSchema(userSchema);
    const response = schema.parse({
      data: [{ id: "user-42", name: "Ada" }],
      pagination: {
        offset: 0,
        limit: 20,
        nextOffset: null,
        total: 1,
      },
    });

    expect(response).toEqual({
      data: [{ id: "user-42", name: "Ada" }],
      pagination: {
        offset: 0,
        limit: 20,
        nextOffset: null,
        total: 1,
      },
    });
    expectTypeOf(response.data).toEqualTypeOf<{ id: string; name: string }[]>();
    expectTypeOf(response.pagination).toEqualTypeOf<{
      offset: number;
      limit: number;
      nextOffset: number | null;
      total?: number | undefined;
    }>();
  });

  test("accepts a continuation offset without requiring a total", () => {
    const schema = createCollectionResponseSchema(userSchema);
    const response = {
      data: [
        { id: "user-42", name: "Ada" },
        { id: "user-43", name: "Grace" },
      ],
      pagination: {
        offset: 10,
        limit: 2,
        nextOffset: 12,
      },
    };

    expect(schema.parse(response)).toEqual(response);
  });

  test("accepts an empty page beyond the end of the collection", () => {
    const schema = createCollectionResponseSchema(userSchema);
    const response = {
      data: [],
      pagination: {
        offset: 20,
        limit: 10,
        nextOffset: null,
        total: 12,
      },
    };

    expect(schema.parse(response)).toEqual(response);
  });

  test("does not infer continuation from a potentially stale total", () => {
    const schema = createCollectionResponseSchema(userSchema);
    const response = {
      data: [{ id: "user-42", name: "Ada" }],
      pagination: {
        offset: 0,
        limit: 20,
        nextOffset: null,
        total: 21,
      },
    };

    expect(schema.parse(response)).toEqual(response);
  });

  test("supports object-preserving resource transforms", () => {
    const schema = createCollectionResponseSchema(
      userSchema.transform((user) => ({ ...user, name: user.name.trim() })),
    );

    expect(
      schema.parse({
        data: [{ id: "user-42", name: "  Ada  " }],
        pagination: { offset: 0, limit: 20, nextOffset: null },
      }),
    ).toEqual({
      data: [{ id: "user-42", name: "Ada" }],
      pagination: { offset: 0, limit: 20, nextOffset: null },
    });
  });

  test("rejects a page containing more resources than its applied limit", () => {
    const schema = createCollectionResponseSchema(userSchema);

    expect(
      schema.safeParse({
        data: [
          { id: "user-42", name: "Ada" },
          { id: "user-43", name: "Grace" },
        ],
        pagination: {
          offset: 0,
          limit: 1,
          nextOffset: 2,
        },
      }).success,
    ).toBe(false);
  });

  test.each([
    {
      data: [{ id: "user-42", name: "Ada" }],
      pagination: { offset: 10, limit: 20, nextOffset: 12 },
    },
    {
      data: [],
      pagination: { offset: 10, limit: 20, nextOffset: 10 },
    },
  ])("rejects a next offset that is not the first resource after the page", (response) => {
    const schema = createCollectionResponseSchema(userSchema);

    expect(schema.safeParse(response).success).toBe(false);
  });

  test.each([
    {},
    { data: [], pagination: { offset: 0, limit: 20, nextOffset: null }, meta: {} },
    { data: [], pagination: { offset: 0, limit: 20, nextOffset: null, page: 1 } },
    { data: ["user-42"], pagination: { offset: 0, limit: 20, nextOffset: null } },
    { data: [], pagination: { offset: -1, limit: 20, nextOffset: null } },
    { data: [], pagination: { offset: 0.5, limit: 20, nextOffset: null } },
    {
      data: [],
      pagination: { offset: Number.MAX_SAFE_INTEGER + 1, limit: 20, nextOffset: null },
    },
    { data: [], pagination: { offset: 0, limit: 0, nextOffset: null } },
    { data: [], pagination: { offset: 0, limit: 2.5, nextOffset: null } },
    {
      data: [],
      pagination: { offset: 0, limit: Number.MAX_SAFE_INTEGER + 1, nextOffset: null },
    },
    { data: [], pagination: { offset: 0, limit: 20 } },
    { data: [], pagination: { offset: 0, limit: 20, nextOffset: -1 } },
    { data: [], pagination: { offset: 0, limit: 20, nextOffset: 0.5 } },
    {
      data: [],
      pagination: { offset: 0, limit: 20, nextOffset: Number.MAX_SAFE_INTEGER + 1 },
    },
    { data: [], pagination: { offset: 0, limit: 20, nextOffset: null, total: -1 } },
    { data: [], pagination: { offset: 0, limit: 20, nextOffset: null, total: 0.5 } },
    {
      data: [],
      pagination: {
        offset: 0,
        limit: 20,
        nextOffset: null,
        total: Number.MAX_SAFE_INTEGER + 1,
      },
    },
    { data: [], pagination: { offset: 0, limit: 20, nextOffset: null, total: null } },
  ])("rejects invalid response %#", (response) => {
    const schema = createCollectionResponseSchema(userSchema);

    expect(schema.safeParse(response).success).toBe(false);
  });

  test("rejects arrays before and after resource parsing", () => {
    const arraySchema = createCollectionResponseSchema(z.array(z.string()));
    const arrayOutputSchema = createCollectionResponseSchema(
      z.object({ id: z.string() }).transform(({ id }) => [id]),
    );
    const pagination = { offset: 0, limit: 20, nextOffset: null };

    expect(arraySchema.safeParse({ data: [["user-42"]], pagination }).success).toBe(false);
    expect(arrayOutputSchema.safeParse({ data: [{ id: "user-42" }], pagination }).success).toBe(
      false,
    );
  });

  test("requires schemas with object input and output types", () => {
    // @ts-expect-error -- A scalar schema cannot represent resource data.
    createCollectionResponseSchema(z.string());
    // @ts-expect-error -- Resource data must be an object before parsing.
    createCollectionResponseSchema(z.string().transform((id) => ({ id })));
    // @ts-expect-error -- Resource data must remain an object after parsing.
    createCollectionResponseSchema(userSchema.transform(({ id }) => id));

    expect(true).toBe(true);
  });
});
