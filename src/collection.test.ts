import { describe, expect, expectTypeOf, test } from "vitest";

import {
  createCollectionResponse,
  createCollectionResponseFromLookahead,
  createUnpaginatedCollectionResponse,
  type CollectionResponse,
} from "./index.js";

interface User {
  id: string;
  name: string;
}

describe("createCollectionResponse", () => {
  test("wraps a resource collection and its pagination without copying them", () => {
    const users: User[] = [{ id: "user-42", name: "Ada" }];
    const pagination = {
      offset: 0,
      limit: 20,
      nextOffset: null,
    };

    const response = createCollectionResponse(users, pagination);

    expect(response).toEqual({ data: users, pagination });
    expect(response.data).toBe(users);
    expect(response.pagination).toBe(pagination);
    expectTypeOf(response).toEqualTypeOf<CollectionResponse<User>>();
  });

  test("includes an exact total when supplied", () => {
    const users: User[] = [{ id: "user-42", name: "Ada" }];
    const pagination = {
      offset: 0,
      limit: 1,
      nextOffset: 1,
      total: 2,
    };

    expect(createCollectionResponse(users, pagination)).toEqual({ data: users, pagination });
  });

  test("requires object resources", () => {
    // @ts-expect-error -- A primitive value cannot represent a resource.
    createCollectionResponse(["user-42"], {
      offset: 0,
      limit: 20,
      nextOffset: null,
    });

    expect(true).toBe(true);
  });
});

describe("createUnpaginatedCollectionResponse", () => {
  test("wraps a complete collection with final-page pagination", () => {
    const users: User[] = [
      { id: "user-42", name: "Ada" },
      { id: "user-43", name: "Grace" },
    ];

    const response = createUnpaginatedCollectionResponse(users);

    expect(response).toEqual({
      data: users,
      pagination: {
        offset: 0,
        limit: 2,
        nextOffset: null,
        total: 2,
      },
    });
    expect(response.data).toBe(users);
    expectTypeOf(response).toEqualTypeOf<CollectionResponse<User>>();
  });

  test("uses the minimum valid limit for an empty collection", () => {
    expect(createUnpaginatedCollectionResponse<User>([])).toEqual({
      data: [],
      pagination: {
        offset: 0,
        limit: 1,
        nextOffset: null,
        total: 0,
      },
    });
  });
});

describe("createCollectionResponseFromLookahead", () => {
  test("removes the lookahead resource and creates a continuation offset", () => {
    const rows: readonly User[] = [
      { id: "user-42", name: "Ada" },
      { id: "user-43", name: "Grace" },
      { id: "user-44", name: "Katherine" },
    ];

    const response = createCollectionResponseFromLookahead(rows, {
      offset: 10,
      limit: 2,
    });

    expect(response).toEqual({
      data: [rows[0], rows[1]],
      pagination: {
        offset: 10,
        limit: 2,
        nextOffset: 12,
      },
    });
    expect(response.data).not.toBe(rows);
    expect(response.data[0]).toBe(rows[0]);
    expect(response.pagination).not.toHaveProperty("total");
    expectTypeOf(response).toEqualTypeOf<CollectionResponse<User>>();
  });

  test("treats a full page without a lookahead resource as the final page", () => {
    const rows: User[] = [
      { id: "user-42", name: "Ada" },
      { id: "user-43", name: "Grace" },
    ];

    expect(
      createCollectionResponseFromLookahead(rows, {
        offset: 10,
        limit: 2,
        total: 12,
      }),
    ).toEqual({
      data: rows,
      pagination: {
        offset: 10,
        limit: 2,
        nextOffset: null,
        total: 12,
      },
    });
  });

  test("preserves a zero total for an empty result", () => {
    expect(
      createCollectionResponseFromLookahead<User>([], {
        offset: 0,
        limit: 20,
        total: 0,
      }),
    ).toEqual({
      data: [],
      pagination: {
        offset: 0,
        limit: 20,
        nextOffset: null,
        total: 0,
      },
    });
  });

  test("rejects more than one lookahead resource", () => {
    const rows: User[] = [
      { id: "user-42", name: "Ada" },
      { id: "user-43", name: "Grace" },
      { id: "user-44", name: "Katherine" },
    ];

    expect(() =>
      createCollectionResponseFromLookahead(rows, {
        offset: 0,
        limit: 1,
      }),
    ).toThrow(RangeError);
  });
});
