import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformRecentCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRecentCommunity";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";
import type { IECommunityPlatformRecentCommunityOrderBy } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformRecentCommunityOrderBy";
import type { IESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IESortDirection";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformRecentCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformRecentCommunity";

/**
 * Ensure a user cannot fetch another user's recent communities.
 *
 * Steps:
 *
 * 1. Register User A and capture userId_A.
 * 2. Register User B and authenticate as B (last join call sets Authorization).
 * 3. As B, verify a self-access happy path: list recent communities for userId_B.
 * 4. As B, attempt to list recent communities for userId_A and expect an error
 *    (authorization boundary – no status code check).
 */
export async function test_api_recent_communities_access_denied_other_user(
  connection: api.IConnection,
) {
  // 1) Register User A
  const joinBodyA = {
    username: `user_${RandomGenerator.alphabets(8)}`,
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12), // >= 8 characters
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const authA: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(connection, {
      body: joinBodyA,
    });
  typia.assert(authA);
  const userIdA = authA.id;

  // 2) Register User B (this also authenticates as B)
  const joinBodyB = {
    username: `user_${RandomGenerator.alphabets(8)}`,
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const authB: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(connection, {
      body: joinBodyB,
    });
  typia.assert(authB);
  const userIdB = authB.id;

  // 3) Self-access happy path: B fetches B\'s recent communities
  const ownPage =
    await api.functional.communityPlatform.communityMember.users.recentCommunities.index(
      connection,
      {
        userId: userIdB,
        body: {} satisfies ICommunityPlatformRecentCommunity.IRequest,
      },
    );
  typia.assert(ownPage);

  // 4) Cross-user access attempt: B tries to fetch A\'s recent communities
  await TestValidator.error(
    "authenticated user cannot fetch another user\'s recent communities",
    async () => {
      await api.functional.communityPlatform.communityMember.users.recentCommunities.index(
        connection,
        {
          userId: userIdA,
          body: {} satisfies ICommunityPlatformRecentCommunity.IRequest,
        },
      );
    },
  );
}
