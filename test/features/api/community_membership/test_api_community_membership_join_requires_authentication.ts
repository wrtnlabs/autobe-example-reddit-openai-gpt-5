import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformCommunityMembership } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMembership";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

/**
 * Ensure unauthenticated users cannot join a community.
 *
 * Business context:
 *
 * - Membership creation requires an authenticated communityMember session.
 * - An owner first creates a community (categoryId provided by fixture), then an
 *   unauthenticated caller attempts to join that community and must fail.
 *
 * Steps:
 *
 * 1. Register (join) as a community member (owner). The SDK sets auth token.
 * 2. Create a community as the authenticated owner.
 * 3. Create an unauthenticated connection and attempt to join the community.
 *    Verify the attempt fails with an error (authorization required).
 */
export async function test_api_community_membership_join_requires_authentication(
  connection: api.IConnection,
) {
  // 1) Owner joins (authenticate)
  const owner = await api.functional.auth.communityMember.join(connection, {
    body: {
      username: `owner_${RandomGenerator.alphaNumeric(8)}`,
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12), // >= 8 chars
    } satisfies ICommunityPlatformCommunityMember.ICreate,
  });
  typia.assert(owner);

  // 2) Owner creates a community
  const communityName: string = `c${RandomGenerator.alphaNumeric(10)}`; // starts with letter, len 11
  const community: ICommunityPlatformCommunity =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      {
        body: {
          name: communityName,
          community_platform_category_id: typia.random<
            string & tags.Format<"uuid">
          >(),
          description: RandomGenerator.paragraph({ sentences: 8 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);

  // 3) Attempt to join without authentication
  // Create an unauthenticated connection (ONLY allowed pattern)
  const unauthConn: api.IConnection = { ...connection, headers: {} };

  await TestValidator.error(
    "unauthenticated user cannot join a community",
    async () => {
      await api.functional.communityPlatform.communityMember.communities.memberships.create(
        unauthConn,
        {
          communityId: community.id,
          body: {} satisfies ICommunityPlatformCommunityMembership.ICreate,
        },
      );
    },
  );
}
