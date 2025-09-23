import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSystemAdmin";
import type { ICommunityPlatformSystemAdminPassword } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSystemAdminPassword";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

/**
 * Ensure only authenticated systemAdmin can change password; reject
 * unauthenticated and wrong-role requests.
 *
 * Scenario:
 *
 * 1. Attempt to change system admin password without any credentials → must fail.
 * 2. Register and authenticate as communityMember, then attempt the same
 *    admin-only password change → must fail.
 *
 * Rules:
 *
 * - Use valid request body (ICommunityPlatformSystemAdminPassword.IUpdate) so
 *   failures are authorization-driven.
 * - Do not manipulate headers directly (except creating a fresh unauthenticated
 *   connection with headers: {}).
 * - Do not assert specific HTTP status codes; only assert that an error occurs.
 */
export async function test_api_system_admin_password_change_unauthorized_access(
  connection: api.IConnection,
) {
  // Prepare a valid password update body (meets min length 8 requirements)
  const updateBody = {
    current_password: RandomGenerator.alphaNumeric(12),
    new_password: RandomGenerator.alphaNumeric(12),
    revoke_other_sessions: true,
    issue_new_tokens: false,
  } satisfies ICommunityPlatformSystemAdminPassword.IUpdate;

  // A) Unauthenticated attempt: clone connection with empty headers
  const unauthenticated: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "unauthenticated user cannot change system admin password",
    async () => {
      await api.functional.auth.systemAdmin.password.changePassword(
        unauthenticated,
        { body: updateBody },
      );
    },
  );

  // B) Wrong-role attempt: communityMember joins and gets authenticated token
  const joinBody = {
    username: RandomGenerator.name(1),
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const memberAuth = await api.functional.auth.communityMember.join(
    connection,
    {
      body: joinBody,
    },
  );
  typia.assert(memberAuth);

  await TestValidator.error(
    "communityMember cannot access system admin password change",
    async () => {
      await api.functional.auth.systemAdmin.password.changePassword(
        connection,
        { body: updateBody },
      );
    },
  );
}
