import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformSiteAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSiteAdmin";
import type { ICommunityPlatformSiteAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSiteAdminJoin";
import type { ICommunityPlatformSiteAdminRefresh } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSiteAdminRefresh";

export async function test_api_site_admin_session_refresh_invalid_or_revoked_token_unauthorized(
  connection: api.IConnection,
) {
  /** 1. Create a new Site Admin (authorized session issued on success) */
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    username: RandomGenerator.alphaNumeric(8),
    password: RandomGenerator.alphaNumeric(12),
    displayName: RandomGenerator.name(1),
  } satisfies ICommunityPlatformSiteAdminJoin.ICreate;
  const authorized = await api.functional.auth.siteAdmin.join(connection, {
    body: joinBody,
  });
  typia.assert(authorized);

  // Keep current token for later comparison
  const initialAccessToken: string = authorized.token.access;
  const initialUserId: string = authorized.userId;

  /**
   * 2. Try invalid/unauthorized refresh using a fresh unauthenticated connection
   *
   *    - Do NOT touch the original connection.headers beyond cloning
   */
  const unauthConn: api.IConnection = { ...connection, headers: {} };

  const badRefreshBody = {
    sessionId: typia.random<string & tags.Format<"uuid">>(),
    refreshToken: RandomGenerator.alphaNumeric(64),
    userAgent: `e2e-test/${RandomGenerator.alphaNumeric(6)}`,
    clientPlatform: "node-e2e",
  } satisfies ICommunityPlatformSiteAdminRefresh.IRequest;

  await TestValidator.error(
    "invalid admin session refresh should be rejected",
    async () => {
      await api.functional.auth.siteAdmin.refresh(unauthConn, {
        body: badRefreshBody,
      });
    },
  );

  /**
   * 3. Valid refresh using the original authorized connection
   *
   *    - Use empty body (all fields optional) to perform standard refresh
   */
  const refreshed = await api.functional.auth.siteAdmin.refresh(connection, {
    body: {} satisfies ICommunityPlatformSiteAdminRefresh.IRequest,
  });
  typia.assert(refreshed);

  // Business validations
  TestValidator.equals(
    "admin identity should persist across refresh",
    refreshed.userId,
    initialUserId,
  );
  TestValidator.notEquals(
    "access token should rotate on successful refresh",
    refreshed.token.access,
    initialAccessToken,
  );
}
