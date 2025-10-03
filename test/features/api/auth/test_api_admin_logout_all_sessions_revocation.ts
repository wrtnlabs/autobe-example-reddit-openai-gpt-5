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
 * Revoke all admin sessions and verify protected access is denied afterward.
 *
 * Scenario:
 *
 * 1. Register a new Site Admin via join to obtain an authenticated session (SDK
 *    sets Authorization header automatically).
 * 2. Pre-check: call a protected admin endpoint (users.index) and verify it
 *    succeeds by asserting the response type.
 * 3. Call POST /auth/siteAdmin/logoutAll to revoke all admin sessions.
 * 4. Attempt the protected admin endpoint again using the same connection and
 *    expect an error (unauthorized) since the token is revoked.
 * 5. Idempotency: call logoutAll once more to ensure it succeeds without error.
 *
 * Notes:
 *
 * - Do not touch connection.headers directly; SDK manages tokens.
 * - Do not assert specific HTTP status codes or error messages; only check that
 *   an error occurs after logoutAll when accessing protected endpoints.
 */
export async function test_api_admin_logout_all_sessions_revocation(
  connection: api.IConnection,
) {
  // 1) Register a new Site Admin to obtain an authenticated session
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    username: RandomGenerator.alphaNumeric(12), // 3-30 chars, [A-Za-z0-9_-], start/end alnum satisfied
    password: RandomGenerator.alphaNumeric(12), // >= 8 chars
    displayName: RandomGenerator.name(2), // <= 64 chars
  } satisfies ICommunityPlatformSiteAdminJoin.ICreate;
  const authorized: ICommunityPlatformSiteAdmin.IAuthorized =
    await api.functional.auth.siteAdmin.join(connection, { body: joinBody });
  typia.assert(authorized);

  // 2) Pre-check: protected admin endpoint should succeed while authenticated
  const preCheckPage: IPageICommunityPlatformUser.ISummary =
    await api.functional.communityPlatform.siteAdmin.users.index(connection, {
      body: { limit: 5 } satisfies ICommunityPlatformUser.IRequest,
    });
  typia.assert(preCheckPage);

  // 3) Revoke all sessions for the current admin
  await api.functional.auth.siteAdmin.logoutAll(connection);

  // 4) Attempt protected call again with the same (now invalid) token
  await TestValidator.error(
    "protected admin endpoint should fail after logoutAll",
    async () => {
      await api.functional.communityPlatform.siteAdmin.users.index(connection, {
        body: { limit: 5 } satisfies ICommunityPlatformUser.IRequest,
      });
    },
  );

  // 5) Idempotency: calling logoutAll again should still succeed without error
  await api.functional.auth.siteAdmin.logoutAll(connection);

  // Optional confirmation: protected endpoint still fails after second call
  await TestValidator.error(
    "protected admin endpoint should continue failing after repeated logoutAll",
    async () => {
      await api.functional.communityPlatform.siteAdmin.users.index(connection, {
        body: { limit: 5 } satisfies ICommunityPlatformUser.IRequest,
      });
    },
  );
}
