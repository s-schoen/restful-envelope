import { z } from "zod/v4";

import type { ProblemTypeDefinition } from "../error.js";
import type { ProblemContract } from "./error.js";

type ProblemContractSchemaSource = ProblemContract<ProblemTypeDefinition, z.core.$ZodShape>;

type ProblemContractSchemas<Contracts extends readonly ProblemContractSchemaSource[]> = {
  [Index in keyof Contracts]: Contracts[Index]["schema"];
};

/**
 * Creates a closed Zod schema discriminating the supplied problem contracts by their `type`.
 *
 * The returned schema preserves each contract's input and output types. Problem type URIs must be
 * unique because `type` is the sole discriminator.
 * @throws {TypeError} When no contracts are supplied, contract metadata does not match its schema,
 * or multiple contracts use the same `type`.
 */
export function createProblemDetailsUnionSchema<
  const Contracts extends readonly [ProblemContractSchemaSource, ...ProblemContractSchemaSource[]],
>(...contracts: Contracts): z.ZodDiscriminatedUnion<ProblemContractSchemas<Contracts>, "type">;
export function createProblemDetailsUnionSchema(
  ...contracts: readonly ProblemContractSchemaSource[]
) {
  const firstContract = contracts[0];

  if (firstContract === undefined) {
    throw new TypeError("At least one problem contract is required.");
  }

  const problemTypes = new Set<string>();

  for (const contract of contracts) {
    const schemaShape = contract.schema.unwrap().shape;

    if (schemaShape.type.value !== contract.type) {
      throw new TypeError(`Problem contract type "${contract.type}" does not match its schema.`);
    }

    if (schemaShape.status.value !== contract.status) {
      throw new TypeError("Problem contract status does not match its schema.");
    }

    if (problemTypes.has(contract.type)) {
      throw new TypeError(`Duplicate problem type "${contract.type}".`);
    }

    problemTypes.add(contract.type);
  }

  return z.discriminatedUnion("type", [
    firstContract.schema,
    ...contracts.slice(1).map((contract) => contract.schema),
  ]);
}
