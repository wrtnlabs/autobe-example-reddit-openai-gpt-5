import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ICommunityPlatformRecentCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRecentCommunity";
import type { IECommunityCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityCategory";

/**
 * Guest guard on Recent Communities endpoint (unauthenticated access is
 * denied).
 *
 * Purpose:
 *
 * - Ensure the protected endpoint
 *   `/communityPlatform/registeredMember/me/recentCommunities` rejects requests
 *   when no authentication is present, satisfying the Guest Guard policy.
 *
 * Scope:
 *
 * - Validate only the unauthenticated path. Do not verify HTTP status codes or
 *   error messages; simply ensure an error occurs for unauthenticated access.
 *
 * Steps:
 *
 * 1. Create an unauthenticated connection by cloning the given connection with
 *    empty headers.
 * 2. Call the endpoint with the unauthenticated connection and expect an error.
 */
export async function test_api_recent_communities_guest_guard_unauthenticated(
  connection: api.IConnection,
) {
  // 1) Prepare an unauthenticated connection (do not manipulate existing headers)
  const unauthConn: api.IConnection = { ...connection, headers: {} };

  // 2) Expect an error when calling the protected endpoint without authentication
  await TestValidator.error(
    "guest guard: unauthenticated call to recent communities should fail",
    async () => {
      await api.functional.communityPlatform.registeredMember.me.recentCommunities.index(
        unauthConn,
      );
    },
  );
}
