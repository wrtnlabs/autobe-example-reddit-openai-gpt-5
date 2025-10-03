import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IClientContext } from "@ORGANIZATION/PROJECT-api/lib/structures/IClientContext";
import type { ICommunityPlatformRegisteredMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRegisteredMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

/**
 * Verify registered member password rotation with current-session continuity.
 *
 * Business intent:
 *
 * - A newly registered member updates their password by providing the correct
 *   current password.
 * - Provider may rotate tokens; this test accepts either behavior without
 *   manipulating headers.
 * - A subsequent attempt using the now-stale, original password must fail.
 *
 * Steps:
 *
 * 1. Register a new member (join) to obtain an authenticated session; SDK sets
 *    Authorization automatically.
 * 2. Update password with correct current password; expect success (updated=true)
 *    and validate optional rotated token structure if provided.
 * 3. Attempt to update password again using the original (stale) password as
 *    current_password; expect error.
 */
export async function test_api_member_password_rotation_current_session_continues(
  connection: api.IConnection,
) {
  // 1) Register a new member to create an authenticated session
  const initialPassword = `Pw_${RandomGenerator.alphaNumeric(12)}`;
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    username: `user_${RandomGenerator.alphaNumeric(10)}`,
    password: initialPassword,
    displayName: RandomGenerator.name(1),
    client: {
      userAgent: "e2e/community-platform",
      sessionType: "standard",
    },
  } satisfies ICommunityPlatformRegisteredMember.IJoin;

  const authorized: ICommunityPlatformRegisteredMember.IAuthorized =
    await api.functional.auth.registeredMember.join(connection, {
      body: joinBody,
    });
  typia.assert(authorized);

  // 2) Update password with the correct current password
  const newPassword1 = `N1_${RandomGenerator.alphaNumeric(14)}`;
  const firstUpdate =
    await api.functional.auth.registeredMember.password.updatePassword(
      connection,
      {
        body: {
          current_password: initialPassword,
          new_password: newPassword1,
          revoke_other_sessions: false,
        } satisfies ICommunityPlatformRegisteredMember.IUpdatePassword,
      },
    );
  typia.assert(firstUpdate);

  // Optional: if provider returns a rotated token, validate its structure
  if (firstUpdate.token !== undefined) {
    typia.assert<IAuthorizationToken>(firstUpdate.token);
  }

  TestValidator.equals(
    "password update flag is true",
    firstUpdate.updated,
    true,
  );

  // 3) Attempt to update again using the original, now-stale password
  // Expect failure regardless of whether the access token rotated or not
  const newPassword2 = `N2_${RandomGenerator.alphaNumeric(14)}`;
  await TestValidator.error(
    "update with stale old password must fail",
    async () => {
      await api.functional.auth.registeredMember.password.updatePassword(
        connection,
        {
          body: {
            current_password: initialPassword, // stale after first rotation
            new_password: newPassword2,
          } satisfies ICommunityPlatformRegisteredMember.IUpdatePassword,
        },
      );
    },
  );
}
