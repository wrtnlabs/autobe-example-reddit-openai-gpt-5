import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSystemAdmin";

export async function test_api_system_admin_refresh_after_logout_all_denied(
  connection: api.IConnection,
) {
  // 1) Create a system admin and obtain tokens
  const authorized = await api.functional.auth.systemAdmin.join(connection, {
    body: typia.random<ICommunityPlatformSystemAdmin.ICreate>(),
  });
  typia.assert(authorized);

  const oldRefreshToken: string = authorized.token.refresh;

  // 2) Revoke all sessions
  const signOutAll =
    await api.functional.auth.systemAdmin.logoutAll.signOutAll(connection);
  typia.assert(signOutAll);
  TestValidator.equals(
    "logout-all operation should succeed",
    signOutAll.ok,
    true,
  );
  TestValidator.predicate(
    "at least one session should be revoked",
    signOutAll.count >= 1,
  );

  // 3) Attempt to refresh using the old refresh token - it must fail
  // Create a fresh, unauthenticated connection without touching existing headers
  const unauthConn: api.IConnection = { ...connection, headers: {} };

  await TestValidator.error(
    "refresh must fail after logout-all when using an old refresh token",
    async () => {
      await api.functional.auth.systemAdmin.refresh(unauthConn, {
        body: {
          refresh_token: oldRefreshToken,
        } satisfies ICommunityPlatformSystemAdmin.IRefresh,
      });
    },
  );
}
