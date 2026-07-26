import { describe, expect, expectTypeOf, test } from "vitest";

import { createCollectionResponse, type CollectionResponse } from "./index.js";

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
