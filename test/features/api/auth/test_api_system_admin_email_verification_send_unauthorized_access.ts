import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformSystemAdminEmailVerify } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSystemAdminEmailVerify";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

/**
 * Verify that unauthorized callers cannot trigger system admin email
 * verification.
 *
 * Business rule: Only authenticated systemAdmin users can request a
 * verification email to be sent to their own email address. Unauthenticated
 * callers and callers authenticated as communityMember must be blocked.
 *
 * Steps:
 *
 * 1. Unauthenticated attempt: clone the connection with empty headers and call
 *    POST /auth/systemAdmin/email/verify/send -> expect an error.
 * 2. CommunityMember attempt: join + login as a community member, then call the
 *    same endpoint -> expect an error.
 */
export async function test_api_system_admin_email_verification_send_unauthorized_access(
  connection: api.IConnection,
) {
  // 1) Unauthenticated attempt must fail
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "unauthenticated caller cannot send system admin email verification",
    async () => {
      await api.functional.auth.systemAdmin.email.verify.send.sendEmailVerification(
        unauthConn,
      );
    },
  );

  // 2) communityMember attempt must fail
  const joinBody = {
    username: RandomGenerator.name(1),
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const memberAuthFromJoin: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(connection, {
      body: joinBody,
    });
  typia.assert(memberAuthFromJoin);

  // Optional re-login using email+password (confirms dependency and refreshes token)
  const loginBody = {
    email: joinBody.email,
    password: joinBody.password,
  } satisfies ICommunityPlatformCommunityMember.ILogin.IByEmail;
  const memberAuthFromLogin: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.login(connection, {
      body: loginBody,
    });
  typia.assert(memberAuthFromLogin);

  await TestValidator.error(
    "community member cannot call system admin email verification send",
    async () => {
      await api.functional.auth.systemAdmin.email.verify.send.sendEmailVerification(
        connection,
      );
    },
  );
}
