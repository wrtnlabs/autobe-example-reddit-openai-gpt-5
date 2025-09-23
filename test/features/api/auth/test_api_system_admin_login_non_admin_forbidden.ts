import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSystemAdmin";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

/**
 * Deny systemAdmin login for non-admin community members.
 *
 * This test ensures that role-gated authentication is enforced: a user who has
 * joined as a communityMember must not be able to authenticate via the
 * systemAdmin login endpoint even with valid credentials.
 *
 * Steps:
 *
 * 1. Register a community member using POST /auth/communityMember/join with valid
 *    username, email, and password (ICreate DTO).
 * 2. Attempt to authenticate via POST /auth/systemAdmin/login using the same
 *    email/password.
 * 3. Expect the admin login attempt to fail (error thrown). Do not validate HTTP
 *    status codes or error messages—only that an error occurs.
 */
export async function test_api_system_admin_login_non_admin_forbidden(
  connection: api.IConnection,
) {
  // 1) Register a non-admin community member
  const username = RandomGenerator.name(1);
  const email = typia.random<string & tags.Format<"email">>();
  const password = RandomGenerator.alphaNumeric(12);

  const member = await api.functional.auth.communityMember.join(connection, {
    body: {
      username,
      email,
      password,
    } satisfies ICommunityPlatformCommunityMember.ICreate,
  });
  typia.assert(member);

  // 2) Attempt to authenticate as system admin with the member's credentials
  await TestValidator.error(
    "non-admin member cannot log in via systemAdmin/login",
    async () => {
      await api.functional.auth.systemAdmin.login(connection, {
        body: {
          email,
          password,
        } satisfies ICommunityPlatformSystemAdmin.ILogin,
      });
    },
  );
}
