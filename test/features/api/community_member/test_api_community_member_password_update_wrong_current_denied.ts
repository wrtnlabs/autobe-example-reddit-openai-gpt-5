import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

/**
 * Verify that providing an incorrect current password results in a rejection
 * and leaves credentials unchanged.
 *
 * Workflow:
 *
 * 1. Register (join) a community member with known credentials.
 * 2. Call PUT /auth/communityMember/password using a wrong current_password and a
 *    new_password → expect error (denied).
 * 3. Attempt POST /auth/communityMember/login with the original (correct) password
 *    → expect success and same subject id.
 * 4. (Optional) Attempt login with the new_password → expect error because no
 *    change occurred.
 *
 * Business rules validated:
 *
 * - Current password verification is mandatory before credential rotation.
 * - Failed verification must not alter stored credentials.
 */
export async function test_api_community_member_password_update_wrong_current_denied(
  connection: api.IConnection,
) {
  // 1) Register (join) a community member with known credentials
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const username: string = `user_${RandomGenerator.alphaNumeric(8)}`;
  const originalPassword: string = RandomGenerator.alphaNumeric(12); // >= 8 chars

  const joined: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(connection, {
      body: {
        username,
        email,
        password: originalPassword,
      } satisfies ICommunityPlatformCommunityMember.ICreate,
    });
  typia.assert(joined);

  // 2) Attempt password update with an incorrect current_password
  const wrongCurrentPassword: string = `${originalPassword}x`;
  const newPassword: string = RandomGenerator.alphaNumeric(12);

  await TestValidator.error(
    "password update should be denied when current_password is incorrect",
    async () => {
      await api.functional.auth.communityMember.password.updatePassword(
        connection,
        {
          body: {
            current_password: wrongCurrentPassword,
            new_password: newPassword,
          } satisfies ICommunityPlatformCommunityMember.IUpdate,
        },
      );
    },
  );

  // 3) Confirm login still succeeds with the original (unchanged) password
  const relogin: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.login(connection, {
      body: {
        email,
        password: originalPassword,
      } satisfies ICommunityPlatformCommunityMember.ILogin.IByEmail,
    });
  typia.assert(relogin);
  TestValidator.equals(
    "login with original password returns same member id",
    relogin.id,
    joined.id,
  );

  // 4) Optional assurance: login with the un-applied newPassword must fail
  await TestValidator.error(
    "login with un-applied new_password should fail",
    async () => {
      await api.functional.auth.communityMember.login(connection, {
        body: {
          email,
          password: newPassword,
        } satisfies ICommunityPlatformCommunityMember.ILogin.IByEmail,
      });
    },
  );
}
