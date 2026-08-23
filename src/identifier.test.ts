import { afterEach, describe, expect, expectTypeOf, test, vi } from "vitest";

import {
  annotateIdentifier,
  generateIdentifier,
  parseIdentifier,
  type Identifier,
  type IdentifierFormatOptions,
  type IdentifierGenerateOptions,
  type IdentifierParseOptions,
} from "./index.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("annotateIdentifier", () => {
  test.each([
    ["10", "10*"],
    ["11", "11~"],
    ["12", "12$"],
    ["13", "13="],
    ["14", "14u"],
    ["15", "150"],
  ])("appends the Crockford checksum to %s", (value, expected) => {
    expect(
      annotateIdentifier(value, {
        calculateChecksum: true,
        blockLengthsChars: [3],
      }),
    ).toBe(expected);
  });

  test("preserves payload symbols unless uppercase is requested", () => {
    expect(
      annotateIdentifier("oIl", {
        calculateChecksum: false,
        case: "lower",
        blockLengthsChars: [3],
      }),
    ).toBe("oIl");
    expect(
      annotateIdentifier("oIl", {
        calculateChecksum: false,
        case: "upper",
        blockLengthsChars: [3],
      }),
    ).toBe("OIL");
  });

  test("groups the complete annotated payload from the left", () => {
    expect(annotateIdentifier("01234567", { blockLengthsChars: [2, 4, 2] })).toBe("01-2345-67");
    expect(
      annotateIdentifier("123456", { calculateChecksum: true, blockLengthsChars: [1, 6] }),
    ).toBe("1-23456e");
  });

  test("requires block lengths to cover the complete annotated payload", () => {
    expect(() => annotateIdentifier("01234567", { blockLengthsChars: [2, 4] })).toThrow(TypeError);
    expect(() =>
      annotateIdentifier("01234567", {
        calculateChecksum: true,
        blockLengthsChars: [2, 4, 2],
      }),
    ).toThrow(TypeError);
  });

  test("adds a collection before the payload", () => {
    expect(annotateIdentifier("10", { blockLengthsChars: [2], collection: "users" })).toBe(
      "users/10",
    );
  });

  test("exposes separate formatting, generation, and parsing options", () => {
    expectTypeOf<IdentifierGenerateOptions>().toExtend<IdentifierFormatOptions>();
    expectTypeOf<IdentifierGenerateOptions>().toHaveProperty("lengthBytes");
    expectTypeOf<IdentifierFormatOptions>().not.toHaveProperty("lengthBytes");
    expectTypeOf<IdentifierParseOptions>().toHaveProperty("hasChecksum");
    expectTypeOf<IdentifierParseOptions>().toHaveProperty("normalizeSymbols");
    expectTypeOf<IdentifierParseOptions>().toHaveProperty("skipValidate");
    expectTypeOf<IdentifierFormatOptions>().toHaveProperty("blockLengthsChars");
    expectTypeOf<IdentifierFormatOptions>().not.toHaveProperty("blockLengthChars");
    expectTypeOf(annotateIdentifier).parameter(1).toEqualTypeOf<IdentifierFormatOptions>();
  });
});

describe("parseIdentifier", () => {
  test("parses a validated identifier without assuming a checksum", () => {
    const id = annotateIdentifier("0123456789", {
      blockLengthsChars: [4, 6],
      collection: "users",
    });

    expect(parseIdentifier(id)).toEqual({
      collection: "users",
      value: "0123456789",
    });
    expectTypeOf(parseIdentifier(id)).toEqualTypeOf<Identifier>();
  });

  test("normalizes Crockford aliases when requested", () => {
    expect(parseIdentifier("users/OIL-~")).toEqual({
      collection: "users",
      value: "011~",
    });
    expect(
      parseIdentifier("users/oIl-~", {
        hasChecksum: true,
        normalizeSymbols: false,
      }),
    ).toEqual({
      collection: "users",
      value: "oIl",
      checksum: "~",
      checksumValid: false,
    });
  });

  test("extracts and validates the final symbol when configured", () => {
    expect(parseIdentifier("users/0-0", { hasChecksum: true })).toEqual({
      collection: "users",
      value: "0",
      checksum: "0",
      checksumValid: true,
    });
    expect(parseIdentifier("10-0", { hasChecksum: true })).toEqual({
      value: "10",
      checksum: "0",
      checksumValid: false,
    });
  });

  test("removes grouping and normalizes lowercase symbols to uppercase", () => {
    expect(parseIdentifier("users/12--34")).toEqual({
      collection: "users",
      value: "1234",
    });
    expect(parseIdentifier("c")).toEqual({ value: "C" });
  });

  test("rejects strings outside the identifier schema", () => {
    for (const value of [
      "",
      "/1234",
      "Users/1234",
      "users//1234",
      "users/",
      "1234!",
      "12~34",
      "ſ234",
      "ı234",
    ]) {
      expect(() => parseIdentifier(value)).toThrow(TypeError);
    }
  });

  test("can skip schema validation for previously validated input", () => {
    expect(() => parseIdentifier("Users/raw!")).toThrow(TypeError);
    expect(
      parseIdentifier("Users/raw!", {
        normalizeSymbols: false,
        skipValidate: true,
      }),
    ).toEqual({
      collection: "Users",
      value: "raw!",
    });
  });
});

describe("generateIdentifier", () => {
  test("uses the restructured generation defaults", () => {
    let calls = 0;
    const getRandomValues = <T extends ArrayBufferView>(array: T): T => {
      calls += 1;
      if (array instanceof Uint8Array) {
        array.fill(0);
      }
      return array;
    };
    vi.stubGlobal("crypto", { getRandomValues });

    expect(generateIdentifier({ blockLengthsChars: [2], lengthBytes: 1 })).toBe("00");
    expect(generateIdentifier()).toBe("000000-000000-000000-000000");
    expect(calls).toBe(2);
  });

  test("zero-extends bytes on the most-significant side", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: <T extends ArrayBufferView>(array: T): T => {
        if (array instanceof Uint8Array) {
          array.fill(0xff);
        }
        return array;
      },
    });

    expect(
      generateIdentifier({
        calculateChecksum: false,
        blockLengthsChars: [2],
        lengthBytes: 1,
      }),
    ).toBe("7Z");
  });

  test("encodes mixed bytes across Base32 symbol boundaries", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: <T extends ArrayBufferView>(array: T): T => {
        if (array instanceof Uint8Array) {
          array.set([0x01, 0x23, 0x45]);
        }
        return array;
      },
    });

    expect(
      generateIdentifier({
        calculateChecksum: false,
        case: "upper",
        blockLengthsChars: [5],
        lengthBytes: 3,
      }),
    ).toBe("028T5");
  });

  test("fails rather than using an insecure random fallback", () => {
    vi.stubGlobal("crypto", undefined);

    expect(() => generateIdentifier()).toThrow("Secure random number generation is unavailable");
  });
});
