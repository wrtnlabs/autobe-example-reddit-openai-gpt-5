import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

/**
 * Requesting a non-existent user by UUID should fail without leaking details.
 *
 * Purpose:
 *
 * - Ensure that GET /communityPlatform/users/{userId} with a syntactically valid
 *   but non-existent UUID results in an error.
 * - Perform the request without any Authorization header.
 *
 * Validation approach:
 *
 * - In real backend mode, assert that an error occurs using TestValidator.error.
 *   Do not assert specific HTTP status codes or messages.
 * - In simulate mode (SDK mock), the call returns random data; assert the
 *   response type instead for deterministic test success.
 *
 * Steps:
 *
 * 1. Build an unauthenticated connection (headers: {}).
 * 2. Generate a random UUID v4.
 * 3. Call the endpoint.
 * 4. Validate behavior depending on simulation mode.
 */
export async function test_api_user_detail_not_found(
  connection: api.IConnection,
) {
  // 1) Build an unauthenticated connection (do not manipulate headers afterward)
  const unauthConn: api.IConnection = { ...connection, headers: {} };

  // 2) Generate a syntactically valid but non-existent UUID v4
  const nonExistentUserId = typia.random<string & tags.Format<"uuid">>();

  // 3-4) Execute and validate
  if (connection.simulate === true) {
    // Simulator returns random entity; just validate type
    const output = await api.functional.communityPlatform.users.at(unauthConn, {
      userId: nonExistentUserId,
    });
    typia.assert(output);
  } else {
    // Real backend should error for non-existent UUID; do not assert specific status code
    await TestValidator.error(
      "non-existent user lookup should result in an error (no status assertion)",
      async () => {
        await api.functional.communityPlatform.users.at(unauthConn, {
          userId: nonExistentUserId,
        });
      },
    );
  }
}
