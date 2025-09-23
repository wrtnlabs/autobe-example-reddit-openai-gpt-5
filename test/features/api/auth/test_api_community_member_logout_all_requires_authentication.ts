import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";

/**
 * Ensure logoutAll requires authentication and rejects unauthenticated access.
 *
 * Business rationale:
 *
 * - POST /auth/communityMember/logoutAll revokes all active sessions for the
 *   authenticated community member. Such an operation must not be available to
 *   unauthenticated callers.
 *
 * Test steps:
 *
 * 1. Build an unauthenticated connection (headers: {}) without touching headers
 *    afterward (SDK manages headers automatically).
 * 2. Call api.functional.auth.communityMember.logoutAll with the unauthenticated
 *    connection and verify it throws an error.
 *
 * Validation rules:
 *
 * - Use TestValidator.error to assert an error occurs (no status code checks).
 * - Await all async calls; do not use typia.assert on void results.
 */
export async function test_api_community_member_logout_all_requires_authentication(
  connection: api.IConnection,
) {
  // 1) Prepare an unauthenticated connection. Do not manipulate headers after creation.
  const unauthConn: api.IConnection = { ...connection, headers: {} };

  // 2) Expect authorization failure when calling logoutAll without authentication
  await TestValidator.error(
    "logoutAll requires authentication: unauthenticated call must fail",
    async () => {
      await api.functional.auth.communityMember.logoutAll(unauthConn);
    },
  );
}
