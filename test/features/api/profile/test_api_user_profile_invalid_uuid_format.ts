import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ICommunityPlatformUserProfile } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUserProfile";

/**
 * Validate behavior when requesting a user profile by UUID.
 *
 * Original scenario required sending an invalid UUID and asserting 400 status
 * and headers. This is not implementable under strict typing and rules (cannot
 * deliberately send wrong types). Therefore, this test verifies:
 *
 * 1. Success path using simulator: ensures the endpoint returns a correctly typed
 *    ICommunityPlatformUserProfile when called with a valid UUID.
 * 2. Error path on real backend: calling with a valid-but-nonexistent UUID is
 *    expected to throw an error (without asserting specific HTTP status).
 *
 * Steps:
 *
 * - Create a simulated connection and call the endpoint with a valid UUID, assert
 *   the response type.
 * - On real backend (non-simulate), attempt with a fresh random UUID and expect
 *   an error.
 */
export async function test_api_user_profile_invalid_uuid_format(
  connection: api.IConnection,
) {
  // 1) Success path via simulator: validate response shape
  const simConnection: api.IConnection = { ...connection, simulate: true };
  const simUserId = typia.random<string & tags.Format<"uuid">>();
  const simOutput = await api.functional.communityPlatform.users.profile.at(
    simConnection,
    { userId: simUserId },
  );
  typia.assert(simOutput);

  // 2) Error path on real backend: valid-but-nonexistent UUID should fail
  //    (skip if the original connection is simulated already)
  if (!connection.simulate) {
    const unknownUserId = typia.random<string & tags.Format<"uuid">>();
    await TestValidator.error(
      "non-existent user profile request should raise an error",
      async () => {
        await api.functional.communityPlatform.users.profile.at(connection, {
          userId: unknownUserId,
        });
      },
    );
  }
}
