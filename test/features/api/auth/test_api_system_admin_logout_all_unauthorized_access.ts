import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSystemAdmin";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

export async function test_api_system_admin_logout_all_unauthorized_access(
  connection: api.IConnection,
) {
  /**
   * Ensure admin-only sign-out-all rejects unauthorized callers.
   *
   * Steps:
   *
   * 1. Prepare valid communityMember credentials (email format, password >= 8).
   * 2. Unauthenticated attempt: call POST /auth/systemAdmin/logoutAll with a fresh
   *    unauthenticated connection → expect an error.
   * 3. Community member flow: join + login (email) to obtain a non-admin token,
   *    then attempt the same admin-only endpoint → expect an error.
   *
   * Notes:
   *
   * - We do not validate specific HTTP status codes.
   * - Auth headers are managed by the SDK; we only create a fresh unauth
   *   connection for step 2 using headers: {} and leave it untouched.
   */

  // 1) Test data
  const username: string = RandomGenerator.name(1);
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const password: string = RandomGenerator.alphaNumeric(12);

  // 2) Unauthenticated request must fail
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "unauthenticated caller cannot invoke systemAdmin logoutAll",
    async () => {
      await api.functional.auth.systemAdmin.logoutAll.signOutAll(unauthConn);
    },
  );

  // 3) Community member creates account and logs in
  const joined: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(connection, {
      body: {
        username,
        email,
        password,
      } satisfies ICommunityPlatformCommunityMember.ICreate,
    });
  typia.assert(joined);

  const loggedIn: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.login(connection, {
      body: {
        email,
        password,
      } satisfies ICommunityPlatformCommunityMember.ILogin.IByEmail,
    });
  typia.assert(loggedIn);

  // With a non-admin token, the admin-only endpoint must still fail
  await TestValidator.error(
    "communityMember token cannot invoke systemAdmin logoutAll",
    async () => {
      await api.functional.auth.systemAdmin.logoutAll.signOutAll(connection);
    },
  );
}
