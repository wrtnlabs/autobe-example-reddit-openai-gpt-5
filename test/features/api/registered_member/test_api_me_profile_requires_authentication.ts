import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

/**
 * Verify guest guard for the current-user profile endpoint.
 *
 * Purpose:
 *
 * - Ensure GET /communityPlatform/registeredMember/me is protected and rejects
 *   unauthenticated access.
 *
 * Scope:
 *
 * - Uses a cloned unauthenticated connection (headers: {}) to simulate a guest
 *   request. We explicitly set simulate: false to avoid simulation mode which
 *   would otherwise return random data and defeat guard testing.
 * - Validates only that an error occurs (no status code/message assertions).
 *
 * Steps:
 *
 * 1. Construct an unauthenticated connection from the provided connection.
 * 2. Call the endpoint and assert it rejects with an error.
 */
export async function test_api_me_profile_requires_authentication(
  connection: api.IConnection,
) {
  // 1) Prepare unauthenticated connection (do not manipulate headers beyond this creation)
  const unauthConn: api.IConnection = {
    ...connection,
    headers: {},
    simulate: false,
  };

  // 2) Expect unauthorized access to fail for guests
  await TestValidator.error(
    "guest must be blocked from accessing current-user profile",
    async () => {
      await api.functional.communityPlatform.registeredMember.me.at(unauthConn);
    },
  );
}
