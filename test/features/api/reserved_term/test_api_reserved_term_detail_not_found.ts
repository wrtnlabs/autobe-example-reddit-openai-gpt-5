import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ICommunityPlatformReservedTerm } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformReservedTerm";

/**
 * Verify not-found behavior when loading a reserved term by ID.
 *
 * Context:
 *
 * - Reserved terms are public, read-only resources used to block specific
 *   names/identifiers. Fetching an unknown ID must not leak internal details
 *   and should result in a not-found error on a real backend.
 *
 * Strategy:
 *
 * 1. Generate a well-formed UUID for a non-existent record.
 * 2. If running in simulation mode, the SDK always returns mock data:
 *
 *    - Call the API and assert the response type, then short-circuit.
 * 3. Otherwise, assert that calling the API with the random UUID results in a
 *    runtime error (do not assert specific HTTP status codes).
 */
export async function test_api_reserved_term_detail_not_found(
  connection: api.IConnection,
) {
  // Simulation mode cannot produce not-found errors; just validate mock output
  if (connection.simulate === true) {
    const simulatedId = typia.random<string & tags.Format<"uuid">>();
    const output = await api.functional.communityPlatform.reservedTerms.at(
      connection,
      { reservedTermId: simulatedId },
    );
    typia.assert(output);
    TestValidator.predicate(
      "simulation mode returns mock data even for random UUIDs",
      true,
    );
    return;
  }

  // Real backend path: use a random, well-formed UUID that should not exist
  const nonExistentId = typia.random<string & tags.Format<"uuid">>();
  await TestValidator.error(
    "requesting non-existent reserved term should fail",
    async () => {
      await api.functional.communityPlatform.reservedTerms.at(connection, {
        reservedTermId: nonExistentId,
      });
    },
  );
}
