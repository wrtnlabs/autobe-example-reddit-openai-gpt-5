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
 * Verify that a community owner can remove another user's membership.
 *
 * Flow:
 *
 * 1. Owner joins (auth) and remains the active identity on the original
 *    connection.
 * 2. Owner creates a community (requires category id fixture; when not provided by
 *    harness, use a valid UUID string for format conformance).
 * 3. MemberUser authenticates using a separate connection object and joins the
 *    Owner's community to create a membership row.
 * 4. Owner deletes the MemberUser's membership using the DELETE endpoint.
 * 5. Validate effects by attempting double deletion (should error) and path
 *    mismatch deletion (should error), implying membership is no longer
 *    active.
 */
export async function test_api_community_membership_owner_removes_member(
  connection: api.IConnection,
) {
  // 1) Owner joins and becomes the active identity on this connection
  const ownerJoinBody = {
    username: RandomGenerator.alphabets(12),
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12), // >=8 chars
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const ownerAuth = await api.functional.auth.communityMember.join(connection, {
    body: ownerJoinBody,
  });
  typia.assert(ownerAuth);

  // 2) Owner creates a community (name pattern satisfied by starting with a letter)
  const categoryId = typia.random<string & tags.Format<"uuid">>(); // external fixture
  const communityCreateBody = {
    name: `c${RandomGenerator.alphabets(7)}${RandomGenerator.alphaNumeric(3)}`,
    community_platform_category_id: categoryId,
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      { body: communityCreateBody },
    );
  typia.assert(community);

  // 3) MemberUser authenticates on a separate connection and joins the community
  const memberConn: api.IConnection = { ...connection, headers: {} };
  const memberJoinBody = {
    username: RandomGenerator.alphabets(12),
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const memberAuth = await api.functional.auth.communityMember.join(
    memberConn,
    { body: memberJoinBody },
  );
  typia.assert(memberAuth);

  const membershipCreateBody =
    {} satisfies ICommunityPlatformCommunityMembership.ICreate;
  const membership =
    await api.functional.communityPlatform.communityMember.communities.memberships.create(
      memberConn,
      {
        communityId: community.id,
        body: membershipCreateBody,
      },
    );
  typia.assert(membership);

  // Validate membership -> community linkage before deletion
  TestValidator.equals(
    "membership belongs to created community",
    membership.community_platform_community_id,
    community.id,
  );

  // 4) Owner removes MemberUser's membership
  await api.functional.communityPlatform.communityMember.communities.memberships.erase(
    connection,
    {
      communityId: community.id,
      membershipId: membership.id,
    },
  );

  // 5) Effects: double delete should fail (already ended)
  await TestValidator.error(
    "double deletion of membership should fail",
    async () => {
      await api.functional.communityPlatform.communityMember.communities.memberships.erase(
        connection,
        {
          communityId: community.id,
          membershipId: membership.id,
        },
      );
    },
  );

  // Effects: mismatched communityId should fail
  const otherCommunityId = typia.random<string & tags.Format<"uuid">>();
  await TestValidator.error(
    "deletion with mismatched communityId should fail",
    async () => {
      await api.functional.communityPlatform.communityMember.communities.memberships.erase(
        connection,
        {
          communityId: otherCommunityId,
          membershipId: membership.id,
        },
      );
    },
  );
}
