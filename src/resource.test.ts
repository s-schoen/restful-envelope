import { describe, expect, expectTypeOf, test } from "vitest";

import { createResourceResponse, type ResourceResponse } from "./index.js";

interface User {
  id: string;
  name: string;
}

describe("createResourceResponse", () => {
  test("wraps one resource without copying it", () => {
    const user: User = { id: "user-42", name: "Ada" };

    const response = createResourceResponse(user);

    expect(response).toEqual({ data: user });
    expect(response.data).toBe(user);
    expectTypeOf(response).toEqualTypeOf<ResourceResponse<User>>();
  });

  test("requires object data", () => {
    // @ts-expect-error -- A primitive value cannot represent a resource.
    createResourceResponse("user-42");

    expect(true).toBe(true);
  });
});
