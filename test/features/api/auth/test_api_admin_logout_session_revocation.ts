import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformSiteAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSiteAdmin";
import type { ICommunityPlatformSiteAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSiteAdminJoin";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";
import type { IECommunityPlatformUserSortBy } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformUserSortBy";
import type { IEOrderDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IEOrderDirection";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformUser";

/**
 * Admin logout revokes the current session and blocks subsequent protected
 * access.
 *
 * Business flow:
 *
 * 1. Join a new site admin to obtain an authenticated session (token auto-set by
 *    SDK).
 * 2. Access a protected admin endpoint successfully (session active).
 * 3. Call logout to revoke current session.
 * 4. Immediately retry the protected endpoint; expect failure (revoked session).
 * 5. Call logout again to verify idempotency (no error).
 * 6. Negative: Call logout without authentication; expect error.
 *
 * Notes:
 *
 * - No status code or error message assertions are performed; only success/error
 *   behavior is validated.
 * - Do not touch connection.headers except for making a separate unauthenticated
 *   clone with headers: {}.
 */
export async function test_api_admin_logout_session_revocation(
  connection: api.IConnection,
) {
  // 1) Join a new site admin (auto-authenticated)
  const email = typia.random<string & tags.Format<"email">>();
  const username = `a${RandomGenerator.alphaNumeric(6)}`; // starts alphanumeric, len >= 3
  const password = RandomGenerator.alphaNumeric(12);
  const joinBody = {
    email,
    username,
    password,
    displayName: RandomGenerator.name(),
  } satisfies ICommunityPlatformSiteAdminJoin.ICreate;

  const authorized: ICommunityPlatformSiteAdmin.IAuthorized =
    await api.functional.auth.siteAdmin.join(connection, { body: joinBody });
  typia.assert(authorized);

  // 2) Access protected admin endpoint (should succeed)
  const pageBefore: IPageICommunityPlatformUser.ISummary =
    await api.functional.communityPlatform.siteAdmin.users.index(connection, {
      body: {} satisfies ICommunityPlatformUser.IRequest,
    });
  typia.assert(pageBefore);

  // 3) Logout current session (should succeed)
  await api.functional.auth.siteAdmin.logout(connection);

  // 4) Retry protected endpoint; expect error due to revoked session
  await TestValidator.error(
    "protected admin listing should fail after logout",
    async () => {
      await api.functional.communityPlatform.siteAdmin.users.index(connection, {
        body: {} satisfies ICommunityPlatformUser.IRequest,
      });
    },
  );

  // 5) Idempotency: calling logout again should not error
  await api.functional.auth.siteAdmin.logout(connection);

  // 6) Negative: Unauthenticated logout should error
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "logout without authentication should fail",
    async () => {
      await api.functional.auth.siteAdmin.logout(unauthConn);
    },
  );
}
