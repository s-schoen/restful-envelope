# Identifiers

The identifier helpers generate, annotate, and parse human-readable Crockford Base32 identifiers.
The Zod schema validates their string structure before parsing.

## Format

Identifiers use this application-level format:

```text
[collection/]grouped-payload
```

- `collection` is an optional lowercase, numeric, or hyphenated prefix.
- `grouped-payload` contains letters, digits, and optional grouping hyphens.
- An optional checksum, when enabled during annotation, is appended as the final payload symbol before
  grouping.
- Parsing only treats the final symbol as a checksum when `hasChecksum: true` is supplied.

## Generate An Identifier

`generateIdentifier()` uses `globalThis.crypto.getRandomValues`. It does not fall back to an
insecure random source when Web Crypto is unavailable.

```ts
import { generateIdentifier } from "@s-schoen/restful-envelope";

const userId = generateIdentifier({ collection: "users" });
```

By default, the payload contains 15 random bytes, is divided into four six-character blocks, and
does not include a checksum. Crockford encoding produces uppercase letters; the default `"lower"`
case option preserves that casing. Set `case: "upper"` to uppercase a supplied payload during
annotation.

```ts
const compactId = generateIdentifier({
  calculateChecksum: true,
  case: "upper",
  blockLengthsChars: [33],
  lengthBytes: 20,
});
```

## Annotate A Payload

Use `annotateIdentifier()` to add an optional checksum, collection prefix, grouping, and uppercase
formatting to a payload. The function formats the supplied text without validating or normalizing
its symbols.

```ts
import { annotateIdentifier } from "@s-schoen/restful-envelope";

const id = annotateIdentifier("0123456789", {
  blockLengthsChars: [4, 6],
  collection: "users",
});
// users/0123-456789
```

`blockLengthsChars` defines the block lengths from left to right. Its elements must sum to the
complete payload length, including the checksum when `calculateChecksum` is enabled; otherwise,
`annotateIdentifier()` throws a `TypeError`.

```ts
const id = annotateIdentifier("01234567", {
  blockLengthsChars: [2, 4, 2],
});
// 01-2345-67
```

The checksum is appended directly to the payload before grouping. Use a single block containing
the complete length, such as `blockLengthsChars: [10]`, to disable visible grouping. When supplying
a custom `lengthBytes` value to `generateIdentifier()`, provide block lengths matching the encoded
payload length.

## Parse An Identifier

`parseIdentifier()` validates the string with `identifierSchema` by default, removes payload
hyphens, and returns its collection and payload parts.

```ts
import { parseIdentifier } from "@s-schoen/restful-envelope";

parseIdentifier("users/0-0", { hasChecksum: true });
// {
//   collection: "users",
//   value: "0",
//   checksum: "0",
//   checksumValid: true,
// }
```

By default, `hasChecksum` is false and `normalizeSymbols` is true. Normalization uppercases
lowercase letters and maps the Crockford aliases `O`, `I`, and `L` to `0`, `1`, and `1`. Set
`normalizeSymbols: false` to preserve payload symbols and casing. Malformed identifier strings throw
`TypeError`.

Set `skipValidate: true` only when the input has already been validated. This bypasses
`identifierSchema` and parses the supplied string directly; normalization and checksum options still
apply.

```ts
parseIdentifier("Users/raw!", {
  normalizeSymbols: false,
  skipValidate: true,
});
// { collection: "Users", value: "raw!" }
```

The checksum detects common transcription and transposition errors. It is not a cryptographic
signature or message-authentication code and must not be used to establish trust.

## Validate Unknown Input

Use `identifierSchema` from the schemas entrypoint to validate an unknown identifier string. The
schema returns the validated string unchanged; use `parseIdentifier()` when parsed identifier parts
are needed.

```ts
import { identifierSchema } from "@s-schoen/restful-envelope/schemas";

const result = identifierSchema.safeParse("users/OIL-~");

if (result.success) {
  console.log(result.data); // users/OIL-~
}
```
