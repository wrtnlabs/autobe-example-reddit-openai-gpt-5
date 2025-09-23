import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

/**
 * Revoke all sessions for a community member using logoutAll and ensure all
 * refresh tokens become invalid.
 *
 * Steps:
 *
 * 1. Join to create Session A and capture its refresh token
 * 2. Login to create Session B and capture its refresh token
 * 3. Call logoutAll while authenticated
 * 4. Verify that refreshing with both Session A and Session B tokens fails
 */
export async function test_api_community_member_logout_all_revokes_all_sessions(
  connection: api.IConnection,
) {
  // 1) Register new community member to create Session A
  const createBody = {
    username: RandomGenerator.name(1),
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12), // >= 8 chars
  } satisfies ICommunityPlatformCommunityMember.ICreate;

  const sessionA: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(connection, {
      body: createBody,
    });
  typia.assert(sessionA);
  const refreshA: string = sessionA.token.refresh;

  // 2) Create an additional session (Session B) via login
  const loginBody = {
    email: createBody.email,
    password: createBody.password,
  } satisfies ICommunityPlatformCommunityMember.ILogin.IByEmail;
  const sessionB: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.login(connection, {
      body: loginBody,
    });
  typia.assert(sessionB);
  const refreshB: string = sessionB.token.refresh;

  // Sanity check: both sessions belong to the same subject id
  TestValidator.equals(
    "both sessions should belong to the same user",
    sessionB.id,
    sessionA.id,
  );

  // 3) Revoke all sessions
  await api.functional.auth.communityMember.logoutAll(connection);

  // 4) Attempt refreshing with both tokens; both must fail
  await TestValidator.error(
    "refresh using Session A token must fail after logoutAll",
    async () => {
      await api.functional.auth.communityMember.refresh(connection, {
        body: {
          refresh_token: refreshA,
        } satisfies ICommunityPlatformCommunityMember.IRefresh,
      });
    },
  );

  await TestValidator.error(
    "refresh using Session B token must fail after logoutAll",
    async () => {
      await api.functional.auth.communityMember.refresh(connection, {
        body: {
          refresh_token: refreshB,
        } satisfies ICommunityPlatformCommunityMember.IRefresh,
      });
    },
  );
}
