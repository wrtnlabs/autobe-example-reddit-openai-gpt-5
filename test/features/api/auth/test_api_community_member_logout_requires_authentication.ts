import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";

/**
 * Ensure logout requires authentication.
 *
 * Scenario:
 *
 * - When a client calls POST /auth/communityMember/logout without being
 *   authenticated, the server must reject the request and not revoke any
 *   session.
 *
 * Test approach:
 *
 * 1. Create an unauthenticated connection by cloning the given connection with an
 *    empty headers object.
 * 2. Call the logout API using this unauthenticated connection.
 * 3. Validate that an error is thrown using TestValidator.error.
 *
 * Notes:
 *
 * - We do not verify specific HTTP status codes or error payloads.
 * - We never manipulate connection.headers beyond creating the unauthenticated
 *   connection.
 */
export async function test_api_community_member_logout_requires_authentication(
  connection: api.IConnection,
) {
  // 1) Create unauthenticated connection (do NOT manipulate headers afterward)
  const unauthConn: api.IConnection = { ...connection, headers: {} };

  // 2) Attempt to logout without authentication and expect an error
  await TestValidator.error(
    "logout requires authentication when no credentials are provided",
    async () => {
      await api.functional.auth.communityMember.logout(unauthConn);
    },
  );
}
