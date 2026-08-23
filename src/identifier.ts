import { identifierSchema } from "./schemas/index.js";

const BASE32_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CHECKSUM_ALPHABET = `${BASE32_ALPHABET}*~$=U`;

/** The parsed parts of an identifier. */
export interface Identifier {
  /** The resource collection prefix, when present. */
  collection?: string;

  /** The final payload symbol when checksum parsing is enabled. */
  checksum?: string;

  /** Whether the supplied checksum matches the payload, when a checksum is present. */
  checksumValid?: boolean;

  /** The ungrouped Crockford Base32 payload, normalized when requested. */
  value: string;
}

/** Controls the human-readable representation of an identifier. */
export interface IdentifierFormatOptions {
  /** A lowercase collection slug to place before the payload. */
  collection?: string;

  /** Whether to append a Crockford modulo-37 checksum. Defaults to `false`. */
  calculateChecksum?: boolean;

  /** Whether to uppercase the formatted identifier. Defaults to `"lower"`, which preserves case. */
  case?: "lower" | "upper";

  /** The left-aligned identifier block lengths. Defaults to [6, 6, 6, 6]. */
  blockLengthsChars?: readonly number[];
}

/** Controls random identifier generation and its human-readable representation. */
export interface IdentifierGenerateOptions extends IdentifierFormatOptions {
  /** The number of cryptographically random payload bytes. Defaults to 15. */
  lengthBytes?: number;
}

export interface IdentifierParseOptions {
  /** Whether the final ungrouped payload symbol is a checksum. Defaults to `false`. */
  hasChecksum?: boolean;

  /** Whether to uppercase letters and normalize `O`, `I`, and `L` aliases. Defaults to `true`. */
  normalizeSymbols?: boolean;

  /** Whether to skip schema validation before parsing. Defaults to `false`. */
  skipValidate?: boolean;
}

const identifierFormatOptionsDefault = {
  calculateChecksum: false,
  case: "lower",
  blockLengthsChars: [6, 6, 6, 6],
} as const satisfies IdentifierFormatOptions;

const identifierGenerateOptionsDefault = {
  ...identifierFormatOptionsDefault,
  lengthBytes: 15,
} as const satisfies IdentifierGenerateOptions;

const identifierParseOptionsDefault = {
  hasChecksum: false,
  normalizeSymbols: true,
  skipValidate: false,
} as const satisfies IdentifierParseOptions;

interface RandomValuesProvider {
  getRandomValues(array: Uint8Array): Uint8Array;
}

function isRandomValuesProvider(value: unknown): value is RandomValuesProvider {
  return (
    typeof value === "object" &&
    value !== null &&
    "getRandomValues" in value &&
    typeof value.getRandomValues === "function"
  );
}

function normalizeBase32Symbol(symbol: string): string {
  if (symbol === "O" || symbol === "o") {
    return "0";
  }

  if (symbol === "I" || symbol === "i" || symbol === "L" || symbol === "l") {
    return "1";
  }

  if (symbol >= "a" && symbol <= "z") {
    return String.fromCharCode(symbol.charCodeAt(0) - 32);
  }

  return symbol;
}

function calculateChecksum(payload: string): string {
  let remainder = 0;

  for (const symbol of payload) {
    const value = BASE32_ALPHABET.indexOf(symbol.toUpperCase());
    remainder = (remainder * 32 + value) % 37;
  }

  return CHECKSUM_ALPHABET.charAt(remainder).toLowerCase();
}

export function parseIdentifierValue(
  id: string,
  hasChecksum: boolean,
  normalizeSymbols: boolean,
): Identifier {
  const collectionSeparator = id.indexOf("/");
  let collection: string | undefined;
  let payload = id;

  if (collectionSeparator !== -1) {
    collection = id.slice(0, collectionSeparator);
    payload = id.slice(collectionSeparator + 1);
  }

  // normalize case
  payload = payload.replace(/-/g, "");

  let normalized = payload;

  // normalize symbols
  if (normalizeSymbols) {
    normalized = "";
    for (const symbol of payload) {
      normalized += normalizeBase32Symbol(symbol);
    }
  }
  const identifier: Identifier = { value: normalized };

  if (hasChecksum) {
    const checksum = normalized.slice(-1);
    identifier.checksum = checksum;
    identifier.checksumValid = calculateChecksum(normalized) === checksum;
    identifier.value = normalized.slice(0, -1);
  }

  if (collection) {
    identifier.collection = collection;
  }

  return identifier;
}

function encodeBase32(bytes: Uint8Array): string {
  const symbolCount = Math.ceil((bytes.length * 8) / 5);
  let bufferedBits = symbolCount * 5 - bytes.length * 8;
  let buffer = 0;
  let encoded = "";

  for (const byte of bytes) {
    buffer = buffer * 256 + byte;
    bufferedBits += 8;

    while (bufferedBits >= 5) {
      bufferedBits -= 5;
      const divisor = 2 ** bufferedBits;
      const value = Math.floor(buffer / divisor);
      encoded += BASE32_ALPHABET.charAt(value);
      buffer %= divisor;
    }
  }

  return encoded;
}

function groupPayload(payload: string, blockLengthsChars: readonly number[]): string {
  const blockLengthSum = blockLengthsChars.reduce((sum, blockLength) => sum + blockLength, 0);

  if (blockLengthSum !== payload.length) {
    throw new TypeError(
      `Identifier block lengths must sum to ${String(payload.length)}, but sum to ${String(blockLengthSum)}.`,
    );
  }

  const blocks: string[] = [];
  let offset = 0;

  for (const blockLength of blockLengthsChars) {
    blocks.push(payload.slice(offset, offset + blockLength));
    offset += blockLength;
  }

  return blocks.join("-");
}

/**
 * Generates a cryptographically random Crockford Base32 identifier.
 *
 * The default payload contains 15 random bytes, uses four six-character blocks, and has no checksum.
 *
 * @throws {Error} When Web Crypto secure randomness is unavailable.
 * @throws {TypeError} When the configured block lengths do not match the annotated payload length.
 */
export function generateIdentifier(opts: IdentifierGenerateOptions = {}): string {
  const lengthBytes = opts.lengthBytes ?? identifierGenerateOptionsDefault.lengthBytes;

  const crypto: unknown = Reflect.get(globalThis, "crypto");
  if (!isRandomValuesProvider(crypto)) {
    throw new Error("Secure random number generation is unavailable.");
  }

  const bytes = new Uint8Array(lengthBytes);
  crypto.getRandomValues(bytes);

  return annotateIdentifier(encodeBase32(bytes), opts);
}

/**
 * Validates and parses an identifier.
 *
 * Hyphens are removed from the payload. By default, lowercase letters are uppercased, the Crockford
 * aliases `O`, `I`, and `L` are normalized, and no checksum is extracted. Set `hasChecksum` to treat
 * the final ungrouped payload symbol as a checksum. Set `skipValidate` only for input that has
 * already been validated.
 *
 * @throws {TypeError} When schema validation is enabled and the identifier is invalid.
 */
export function parseIdentifier(id: string, opts: IdentifierParseOptions = {}): Identifier {
  const skipValidate = opts.skipValidate ?? identifierParseOptionsDefault.skipValidate;
  let idToParse = id;

  if (!skipValidate) {
    const result = identifierSchema.safeParse(id);

    if (!result.success) {
      const message = result.error.issues.at(0)?.message ?? "Identifier is invalid.";
      throw new TypeError(message, { cause: result.error });
    }

    idToParse = result.data;
  }

  return parseIdentifierValue(
    idToParse,
    opts.hasChecksum ?? identifierParseOptionsDefault.hasChecksum,
    opts.normalizeSymbols ?? identifierParseOptionsDefault.normalizeSymbols,
  );
}

/**
 * Annotates a payload with optional checksum, grouping, collection, and uppercase formatting.
 *
 * The checksum is appended before the complete identifier is grouped from the left. A `"lower"`
 * case option preserves the input casing; `"upper"` uppercases the formatted identifier.
 *
 * @throws {TypeError} When the configured block lengths do not match the annotated payload length.
 */
export function annotateIdentifier(id: string, opts: IdentifierFormatOptions): string {
  const calculateChecksumOption =
    opts.calculateChecksum ?? identifierFormatOptionsDefault.calculateChecksum;
  const identifierCase = opts.case ?? identifierFormatOptionsDefault.case;
  const blockLengthsChars =
    opts.blockLengthsChars ?? identifierFormatOptionsDefault.blockLengthsChars;

  const collectionPrefix = opts.collection ? `${opts.collection}/` : "";
  let identifier = "";

  identifier += id;

  if (calculateChecksumOption) {
    identifier += calculateChecksum(identifier);
  }

  const groupedIdentifier = groupPayload(identifier, blockLengthsChars);
  const casedIdentifier =
    identifierCase === "upper" ? groupedIdentifier.toUpperCase() : groupedIdentifier;

  return `${collectionPrefix}${casedIdentifier}`;
}
