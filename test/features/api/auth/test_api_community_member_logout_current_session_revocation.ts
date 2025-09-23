import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

/**
 * Revoke current community member session and deny subsequent refresh.
 *
 * This test verifies the logout flow for a community member session:
 *
 * 1. Register a new member to obtain an initial token bundle
 * 2. Refresh once to confirm the session is active (handles token rotation)
 * 3. Logout to revoke the current session (no response body)
 * 4. Attempt to refresh using the last known refresh token and expect failure
 *
 * Notes:
 *
 * - We only assert business outcomes. We do not assert HTTP status codes.
 * - SDK manages Authorization headers; test never manipulates connection.headers.
 * - Request bodies use satisfies with exact DTO variants.
 */
export async function test_api_community_member_logout_current_session_revocation(
  connection: api.IConnection,
) {
  // 1) Register a new community member (join) to obtain tokens
  const joinBody = {
    username: RandomGenerator.alphabets(12),
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8>>(),
  } satisfies ICommunityPlatformCommunityMember.ICreate;

  const authorized1: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(connection, {
      body: joinBody,
    });
  typia.assert(authorized1);

  const subjectId = authorized1.id; // For consistency check after refresh
  const token1: IAuthorizationToken = authorized1.token;
  typia.assert(token1);

  // 2) Refresh once to confirm session activity (capture newest refresh token)
  const refreshRequest1 = {
    refresh_token: token1.refresh,
  } satisfies ICommunityPlatformCommunityMember.IRefresh;

  const authorized2: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.refresh(connection, {
      body: refreshRequest1,
    });
  typia.assert(authorized2);

  // Subject (member) id must remain the same across refresh
  TestValidator.equals(
    "subject id remains consistent after refresh",
    authorized2.id,
    subjectId,
  );

  const tokenBeforeLogout: IAuthorizationToken = authorized2.token;
  typia.assert(tokenBeforeLogout);

  // 3) Logout to revoke the current session (no body response)
  await api.functional.auth.communityMember.logout(connection);

  // 4) Attempt to refresh with the pre-logout refresh token and expect failure
  await TestValidator.error(
    "refresh using revoked session's token must fail",
    async () => {
      const refreshRequestAfterLogout = {
        refresh_token: tokenBeforeLogout.refresh,
      } satisfies ICommunityPlatformCommunityMember.IRefresh;

      await api.functional.auth.communityMember.refresh(connection, {
        body: refreshRequestAfterLogout,
      });
    },
  );
}
