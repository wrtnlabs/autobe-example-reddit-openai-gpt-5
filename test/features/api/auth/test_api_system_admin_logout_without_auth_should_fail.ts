import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ICommunityPlatformSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSystemAdmin";

/**
 * Ensure system admin logout is rejected without authentication.
 *
 * Business context:
 *
 * - The logout operation revokes the current admin session and therefore requires
 *   an authenticated systemAdmin context.
 * - When called without credentials, the provider must deny the request.
 *
 * Steps:
 *
 * 1. Create an unauthenticated connection (clone with empty headers).
 * 2. Attempt to call POST /auth/systemAdmin/logout using the unauthenticated
 *    connection.
 * 3. Validate that an error is thrown (do not validate specific HTTP status codes
 *    or payload).
 */
export async function test_api_system_admin_logout_without_auth_should_fail(
  connection: api.IConnection,
) {
  // 1) Create unauthenticated connection (allowed pattern: create new object with empty headers)
  const unauthConn: api.IConnection = { ...connection, headers: {} };

  // 2) Expect the logout call to fail due to missing authentication
  await TestValidator.error(
    "system admin logout should fail when unauthenticated",
    async () => {
      await api.functional.auth.systemAdmin.logout.signOut(unauthConn);
    },
  );
}
