import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

export async function test_api_community_member_login_unknown_account_denied(
  connection: api.IConnection,
) {
  /**
   * Validate that login with unknown credentials is denied.
   *
   * Steps:
   *
   * 1. Create an isolated unauthenticated connection (allowed pattern: clone with
   *    headers: {}).
   * 2. Try login by email with a random non-registered email and a valid password
   *    (>= 8 chars).
   * 3. Expect error (do not check specific HTTP status codes).
   * 4. Try login by username with a random non-registered username and a valid
   *    password.
   * 5. Expect error again.
   *
   * Notes:
   *
   * - Do not access or modify connection.headers (SDK manages headers
   *   internally).
   * - Use the exact DTO variants for request bodies with `satisfies`.
   */
  const unauthConn: api.IConnection = { ...connection, headers: {} };

  // Random unknown identifiers respecting DTO constraints
  const unknownEmail: string = typia.random<string & tags.Format<"email">>();
  const unknownUsername: string = RandomGenerator.name(1); // single-word username-like string
  const strongPassword: string = RandomGenerator.alphaNumeric(12); // >= 8 characters

  // Attempt login by email → should fail
  await TestValidator.error(
    "unknown email login should be denied",
    async () => {
      await api.functional.auth.communityMember.login(unauthConn, {
        body: {
          email: unknownEmail,
          password: strongPassword,
        } satisfies ICommunityPlatformCommunityMember.ILogin.IByEmail,
      });
    },
  );

  // Attempt login by username → should fail
  await TestValidator.error(
    "unknown username login should be denied",
    async () => {
      await api.functional.auth.communityMember.login(unauthConn, {
        body: {
          username: unknownUsername,
          password: strongPassword,
        } satisfies ICommunityPlatformCommunityMember.ILogin.IByUsername,
      });
    },
  );
}
