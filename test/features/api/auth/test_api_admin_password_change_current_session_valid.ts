import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformSiteAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSiteAdmin";
import type { ICommunityPlatformSiteAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSiteAdminJoin";
import type { ICommunityPlatformSiteAdminPassword } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSiteAdminPassword";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";
import type { IECommunityPlatformUserSortBy } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformUserSortBy";
import type { IEOrderDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IEOrderDirection";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformUser";

/**
 * Validate password change for an authenticated Site Admin and ensure the
 * current session remains valid immediately after rotation.
 *
 * Steps
 *
 * 1. Register a new Site Admin (auto-authenticated by SDK) and capture auth info.
 * 2. Change password with valid currentPassword/newPassword; verify role/user
 *    linkage is unchanged.
 * 3. Immediately access a protected admin endpoint using the same session to
 *    confirm it remains authorized.
 * 4. Negative: wrong currentPassword should fail and not rotate credentials.
 * 5. Negative: unauthenticated password change attempt should fail.
 */
export async function test_api_admin_password_change_current_session_valid(
  connection: api.IConnection,
) {
  // 1) Join as a new Site Admin (auto-authenticated)
  const email = typia.random<string & tags.Format<"email">>();
  const username = typia.random<
    string &
      tags.Pattern<"^[A-Za-z0-9](?:[A-Za-z0-9_-]{1,28}[A-Za-z0-9])?$"> &
      tags.MinLength<3> &
      tags.MaxLength<30>
  >();
  const initialPassword = typia.random<
    string & tags.MinLength<8> & tags.MaxLength<128>
  >();

  const joinBody = {
    email,
    username,
    password: initialPassword,
    displayName: RandomGenerator.name(2),
  } satisfies ICommunityPlatformSiteAdminJoin.ICreate;

  const authorized = await api.functional.auth.siteAdmin.join(connection, {
    body: joinBody,
  });
  typia.assert(authorized);

  // 2) Change password with valid currentPassword/newPassword
  const newPassword = typia.random<
    string & tags.MinLength<8> & tags.MaxLength<128>
  >();
  const changeBodyOk = {
    currentPassword: initialPassword,
    newPassword,
    revokeOtherSessions: true,
  } satisfies ICommunityPlatformSiteAdminPassword.IUpdate;

  const afterRotation =
    await api.functional.auth.siteAdmin.password.changePassword(connection, {
      body: changeBodyOk,
    });
  typia.assert(afterRotation);

  // Business invariants: role ownership unchanged
  TestValidator.equals(
    "userId should remain the same after password change",
    afterRotation.userId,
    authorized.userId,
  );
  if (authorized.admin) {
    const initialAdmin = typia.assert<ICommunityPlatformSiteAdmin>(
      authorized.admin,
    );
    TestValidator.equals(
      "admin assignment id should be stable",
      afterRotation.id,
      initialAdmin.id,
    );
  }

  // 3) Session continuity: call a protected admin endpoint with same session
  const page = await api.functional.communityPlatform.siteAdmin.users.index(
    connection,
    {
      body: {
        email,
        limit: 20,
      } satisfies ICommunityPlatformUser.IRequest,
    },
  );
  typia.assert(page);
  TestValidator.predicate(
    "admin account should be visible via protected listing using current session",
    page.data.some((u) => u.id === authorized.userId),
  );

  // 4) Negative: wrong current password should fail
  await TestValidator.error(
    "changing password with wrong currentPassword must fail",
    async () => {
      const changeBodyBad = {
        currentPassword: `${initialPassword}-invalid`,
        newPassword: typia.random<
          string & tags.MinLength<8> & tags.MaxLength<128>
        >(),
        revokeOtherSessions: false,
      } satisfies ICommunityPlatformSiteAdminPassword.IUpdate;
      await api.functional.auth.siteAdmin.password.changePassword(connection, {
        body: changeBodyBad,
      });
    },
  );

  // 5) Negative: unauthenticated request should fail
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "unauthenticated password change attempt must fail",
    async () => {
      const unauthBody = {
        currentPassword: newPassword,
        newPassword: typia.random<
          string & tags.MinLength<8> & tags.MaxLength<128>
        >(),
      } satisfies ICommunityPlatformSiteAdminPassword.IUpdate;
      await api.functional.auth.siteAdmin.password.changePassword(unauthConn, {
        body: unauthBody,
      });
    },
  );
}
