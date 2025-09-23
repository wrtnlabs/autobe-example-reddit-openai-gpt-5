import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

/**
 * Validate community member password update: old credentials fail, new
 * credentials succeed.
 *
 * Steps:
 *
 * 1. Register a new community member (join) with email/username/password.
 * 2. Update password using current_password and new_password.
 * 3. Attempt login with old password (expect failure).
 * 4. Attempt login with new password (expect success).
 *
 * Notes:
 *
 * - All request bodies use `satisfies` with the exact DTO types.
 * - Do not touch connection.headers; the SDK manages tokens automatically.
 * - Use typia.assert on non-void responses only.
 */
export async function test_api_community_member_password_update_success_login_old_new(
  connection: api.IConnection,
) {
  // 1) Register (join) a new community member
  const email = typia.random<string & tags.Format<"email">>();
  const username = RandomGenerator.name(1);
  const originalPassword = `${RandomGenerator.alphaNumeric(12)}`; // >= 8 chars

  const joinBody = {
    username,
    email,
    password: originalPassword,
  } satisfies ICommunityPlatformCommunityMember.ICreate;

  const joined = await api.functional.auth.communityMember.join(connection, {
    body: joinBody,
  });
  typia.assert(joined);

  // 2) Update password
  const newPassword = `${RandomGenerator.alphaNumeric(12)}`; // >= 8 chars
  const updateBody = {
    current_password: originalPassword,
    new_password: newPassword,
  } satisfies ICommunityPlatformCommunityMember.IUpdate;

  await api.functional.auth.communityMember.password.updatePassword(
    connection,
    {
      body: updateBody,
    },
  );

  // 3) Login with old password should fail
  await TestValidator.error(
    "login with old password should fail after password rotation",
    async () => {
      await api.functional.auth.communityMember.login(connection, {
        body: {
          email,
          password: originalPassword,
        } satisfies ICommunityPlatformCommunityMember.ILogin.IByEmail,
      });
    },
  );

  // 4) Login with new password should succeed
  const reauth = await api.functional.auth.communityMember.login(connection, {
    body: {
      email,
      password: newPassword,
    } satisfies ICommunityPlatformCommunityMember.ILogin.IByEmail,
  });
  typia.assert(reauth);
}
