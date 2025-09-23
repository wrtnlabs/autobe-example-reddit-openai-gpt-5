import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ICommunityPlatformUserProfile } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUserProfile";

/**
 * Ensure unknown user profile lookups fail safely.
 *
 * This test verifies that requesting a public user profile with a syntactically
 * valid but non-existent userId results in an error (negative-path behavior).
 * As this endpoint is public read, no authentication is required. When running
 * in SDK simulation mode, the underlying simulator always returns random data;
 * therefore, this test adapts by performing type assertion in simulation and
 * reserving the error assertion for real backend execution only.
 *
 * Steps:
 *
 * 1. Generate a valid random UUID.
 * 2. If running against a real backend, expect the call to throw an error.
 * 3. If running in simulation mode, call the endpoint and assert response type.
 */
export async function test_api_user_profile_not_found_for_unknown_user(
  connection: api.IConnection,
) {
  // 1) Prepare a syntactically valid but unknown userId
  const unknownUserId = typia.random<string & tags.Format<"uuid">>();

  // 2) Behavior depends on environment
  if (connection.simulate === true) {
    // In simulation, the SDK returns random data instead of hitting real backend
    const output = await api.functional.communityPlatform.users.profile.at(
      connection,
      { userId: unknownUserId },
    );
    // Validate the simulated response strictly matches the declared DTO type
    typia.assert(output);
  } else {
    // Against a real backend, an unknown userId must result in an error
    await TestValidator.error(
      "unknown user profile request should fail",
      async () => {
        await api.functional.communityPlatform.users.profile.at(connection, {
          userId: unknownUserId,
        });
      },
    );
  }
}
