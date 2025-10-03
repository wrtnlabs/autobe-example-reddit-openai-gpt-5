import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IClientContext } from "@ORGANIZATION/PROJECT-api/lib/structures/IClientContext";
import type { ICommunityPlatformRegisteredMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRegisteredMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

/**
 * Validate member login failure on wrong password and success on retry with
 * correct password.
 *
 * Steps:
 *
 * 1. Register a member via join with unique email/username/password.
 * 2. Attempt login using the correct identifier (email) but an incorrect password
 *    — expect an error.
 * 3. Retry login with the correct credentials — expect success and the same member
 *    id as in join.
 * 4. If user summary is present, verify username/email consistency.
 *
 * Notes:
 *
 * - Error validation uses TestValidator.error without checking status codes or
 *   messages.
 * - An unauthenticated connection clone is used for the failed login attempt;
 *   headers are not inspected or modified afterward.
 */
export async function test_api_member_login_wrong_password_retry_message(
  connection: api.IConnection,
) {
  // 1) Prepare unique credentials
  const email = typia.random<string & tags.Format<"email">>();
  const username = `user_${RandomGenerator.alphaNumeric(12)}`;
  const password = `Pw_${RandomGenerator.alphaNumeric(12)}`;

  // 2) Register (join) the member
  const joined = await api.functional.auth.registeredMember.join(connection, {
    body: {
      email,
      username,
      password,
      displayName: RandomGenerator.name(1),
      client: {
        userAgent: `e2e/${RandomGenerator.alphaNumeric(6)}`,
        ip: "127.0.0.1",
        clientPlatform: "e2e-tests",
        sessionType: "standard",
      },
    } satisfies ICommunityPlatformRegisteredMember.IJoin,
  });
  typia.assert(joined);

  // 3) Prepare an unauthenticated connection for the failed login attempt
  const unauthConn: api.IConnection = { ...connection, headers: {} };

  // 4) Wrong password login should fail
  await TestValidator.error(
    "login with wrong password should fail and not establish session",
    async () => {
      await api.functional.auth.registeredMember.login(unauthConn, {
        body: {
          identifier: email,
          password: `${password}-wrong`,
        } satisfies ICommunityPlatformRegisteredMember.ILogin,
      });
    },
  );

  // 5) Correct login should succeed (using username as identifier)
  const authorized = await api.functional.auth.registeredMember.login(
    connection,
    {
      body: {
        identifier: username,
        password,
      } satisfies ICommunityPlatformRegisteredMember.ILogin,
    },
  );
  typia.assert(authorized);

  // Validate same account
  TestValidator.equals(
    "login returns the same member id as in join",
    authorized.id,
    joined.id,
  );

  // Optional: validate summary if provided
  if (authorized.user !== undefined) {
    TestValidator.equals(
      "user summary id equals authorized id",
      authorized.user.id,
      authorized.id,
    );
    TestValidator.equals(
      "user summary username matches registered username",
      authorized.user.username,
      username,
    );
    TestValidator.equals(
      "user summary email matches registered email",
      authorized.user.email,
      email,
    );
  }
}
