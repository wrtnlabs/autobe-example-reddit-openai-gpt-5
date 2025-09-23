import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

/**
 * Validate session continuity after password update for community members.
 *
 * Workflow:
 *
 * 1. Register a new community member (join) to obtain Session A (IAuthorized).
 * 2. Update the member password using the current password and a new password.
 * 3. Immediately refresh using the refresh token from Session A to confirm that
 *    the session remains valid (or is seamlessly rotated per policy).
 *
 * Validations:
 *
 * - Password update completes successfully (void response).
 * - Refresh returns IAuthorized and typia.assert() passes.
 * - Member id remains identical before/after refresh, proving continuity.
 */
export async function test_api_community_member_password_update_session_continuity_refresh(
  connection: api.IConnection,
) {
  // 1) Register and obtain Session A
  const joinBody = {
    username: `user_${RandomGenerator.alphaNumeric(10)}`,
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformCommunityMember.ICreate;

  const auth1: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(connection, {
      body: joinBody,
    });
  typia.assert(auth1);

  // 2) Change password (using current password from join)
  const newPassword: string = `${RandomGenerator.alphaNumeric(12)}`;
  const updateBody = {
    current_password: joinBody.password,
    new_password: newPassword,
  } satisfies ICommunityPlatformCommunityMember.IUpdate;

  await api.functional.auth.communityMember.password.updatePassword(
    connection,
    { body: updateBody },
  ); // void on success

  // 3) Immediately refresh using the refresh token from Session A
  const refreshBody = {
    refresh_token: auth1.token.refresh,
  } satisfies ICommunityPlatformCommunityMember.IRefresh;

  const refreshed: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.refresh(connection, {
      body: refreshBody,
    });
  typia.assert(refreshed);

  // Ensure same subject (continuity)
  TestValidator.equals(
    "refreshed member id remains identical to original",
    refreshed.id,
    auth1.id,
  );

  // Basic business sanity: token strings are non-empty (beyond type shape)
  TestValidator.predicate(
    "refreshed access token is non-empty",
    refreshed.token.access.length > 0,
  );
  TestValidator.predicate(
    "refreshed refresh token is non-empty",
    refreshed.token.refresh.length > 0,
  );
}
