import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IClientContext } from "@ORGANIZATION/PROJECT-api/lib/structures/IClientContext";
import type { ICommunityPlatformRegisteredMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRegisteredMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

/**
 * Verify password rotation rejects wrong current password without mutating
 * state.
 *
 * Business context:
 *
 * - A registered member attempts to change their password. When supplying an
 *   incorrect current password, the server must fail the operation gracefully
 *   without changing credentials or revoking the active session.
 * - A subsequent attempt with the correct current password should succeed,
 *   proving that the previous failure did not alter account data.
 * - After a successful change, the old password is no longer valid; another
 *   rotation using the old password should fail. The session should remain
 *   active to permit further valid rotations.
 *
 * Steps:
 *
 * 1. Register a new member (join) and obtain authenticated context.
 * 2. Try password update with wrong current_password -> expect error.
 * 3. Update password with correct current_password -> expect success.
 * 4. Try updating again using the obsolete old password -> expect error.
 * 5. Optionally rotate once more using the latest password -> expect success.
 */
export async function test_api_member_password_rotation_wrong_current_password(
  connection: api.IConnection,
) {
  // 1) Register a new member and obtain an authenticated session
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const username: string = RandomGenerator.name(1);
  const originalPassword: string = RandomGenerator.alphaNumeric(12);

  const auth = await api.functional.auth.registeredMember.join(connection, {
    body: {
      email,
      username,
      password: originalPassword,
    } satisfies ICommunityPlatformRegisteredMember.IJoin,
  });
  typia.assert(auth);

  // 2) Attempt password update with a wrong current password
  const wrongAttemptBody = {
    current_password: `${originalPassword}_wrong`,
    new_password: RandomGenerator.alphaNumeric(14),
    revoke_other_sessions: false,
  } satisfies ICommunityPlatformRegisteredMember.IUpdatePassword;

  await TestValidator.error(
    "reject update when current password is incorrect",
    async () => {
      await api.functional.auth.registeredMember.password.updatePassword(
        connection,
        { body: wrongAttemptBody },
      );
    },
  );

  // 3) Perform correct password update using the original password
  const newPassword1: string = RandomGenerator.alphaNumeric(16);
  const correctUpdateBody = {
    current_password: originalPassword,
    new_password: newPassword1,
    revoke_other_sessions: false,
  } satisfies ICommunityPlatformRegisteredMember.IUpdatePassword;

  const firstUpdateResult =
    await api.functional.auth.registeredMember.password.updatePassword(
      connection,
      { body: correctUpdateBody },
    );
  typia.assert(firstUpdateResult);
  TestValidator.equals(
    "first password update should indicate success",
    firstUpdateResult.updated,
    true,
  );

  // 4) Old password should now be invalid for further updates
  const obsoleteAttemptBody = {
    current_password: originalPassword,
    new_password: RandomGenerator.alphaNumeric(15),
    revoke_other_sessions: false,
  } satisfies ICommunityPlatformRegisteredMember.IUpdatePassword;

  await TestValidator.error(
    "old password no longer valid after successful rotation",
    async () => {
      await api.functional.auth.registeredMember.password.updatePassword(
        connection,
        { body: obsoleteAttemptBody },
      );
    },
  );

  // 5) Optional continuity: update again using the latest password
  const newPassword2: string = RandomGenerator.alphaNumeric(18);
  const secondUpdateBody = {
    current_password: newPassword1,
    new_password: newPassword2,
    revoke_other_sessions: false,
  } satisfies ICommunityPlatformRegisteredMember.IUpdatePassword;

  const secondUpdateResult =
    await api.functional.auth.registeredMember.password.updatePassword(
      connection,
      { body: secondUpdateBody },
    );
  typia.assert(secondUpdateResult);
  TestValidator.equals(
    "second password update should indicate success",
    secondUpdateResult.updated,
    true,
  );
}
