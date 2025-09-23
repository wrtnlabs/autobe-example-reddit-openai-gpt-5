import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ICommunityPlatformReservedTerm } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformReservedTerm";

/**
 * Reserved term detail retrieval with valid vs. non-existent UUID handling.
 *
 * Original idea was to validate invalid UUID format on the path parameter, but
 * the SDK enforces `reservedTermId: string & tags.Format<"uuid">` at compile
 * time, preventing such a test without violating type safety. Therefore, this
 * test focuses on two implementable behaviors:
 *
 * 1. Real server: Requesting a well-formed but non-existent UUID should throw an
 *    error (e.g., not-found). We only assert that an error occurs, without
 *    checking HTTP status codes.
 * 2. Simulation mode: The SDK mock returns a random entity when provided a valid
 *    UUID. We assert success and type correctness via typia.assert().
 *
 * Steps:
 *
 * - Generate a valid UUID
 * - If simulate: call the endpoint and assert the response shape
 * - Else: expect the call to throw using TestValidator.error
 */
export async function test_api_reserved_term_detail_invalid_id_format(
  connection: api.IConnection,
) {
  const nonExistentId = typia.random<string & tags.Format<"uuid">>();

  if (connection.simulate === true) {
    const output: ICommunityPlatformReservedTerm =
      await api.functional.communityPlatform.reservedTerms.at(connection, {
        reservedTermId: nonExistentId,
      });
    typia.assert(output);
  } else {
    await TestValidator.error(
      "non-existent reserved term id should cause an error",
      async () => {
        await api.functional.communityPlatform.reservedTerms.at(connection, {
          reservedTermId: nonExistentId,
        });
      },
    );
  }
}
