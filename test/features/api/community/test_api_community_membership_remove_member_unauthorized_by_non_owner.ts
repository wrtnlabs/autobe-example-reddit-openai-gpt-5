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
 * Ensure a non-owner cannot end another member’s membership.
 *
 * Workflow:
 *
 * 1. Owner joins (auth) and creates a community
 * 2. MemberA joins (auth) and joins the community (creates membership)
 * 3. MemberB joins (auth) and attempts to delete MemberA’s membership → must fail
 *
 * Business validations:
 *
 * - Community owner matches the Owner’s authenticated user id
 * - MemberA’s membership links to the correct community and user
 * - Unauthorized deletion attempt by MemberB throws an error (no status code
 *   assertion)
 *
 * Note: community_platform_category_id is provided as a valid UUID. Test infra
 * is expected to supply a real, joinable category or run in simulation mode.
 */
export async function test_api_community_membership_remove_member_unauthorized_by_non_owner(
  connection: api.IConnection,
) {
  // 1) Owner registration/authentication
  const ownerJoinBody = {
    username: `owner_${RandomGenerator.alphabets(8)}`,
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const ownerAuth: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(connection, {
      body: ownerJoinBody,
    });
  typia.assert(ownerAuth);

  // 2) Community creation by Owner
  const communityCreateBody = {
    // ensure starts with a letter, 3-32 length, allowed characters
    name: `c${RandomGenerator.alphaNumeric(7)}`,
    community_platform_category_id: typia.random<
      string & tags.Format<"uuid">
    >(),
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community: ICommunityPlatformCommunity =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      { body: communityCreateBody },
    );
  typia.assert(community);
  // Validate ownership matches creator
  TestValidator.equals(
    "community owner id equals owner's user id",
    community.community_platform_user_id,
    ownerAuth.id,
  );

  // 3) MemberA registration/authentication
  const memberAJoinBody = {
    username: `memberA_${RandomGenerator.alphabets(8)}`,
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const memberAAuth: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(connection, {
      body: memberAJoinBody,
    });
  typia.assert(memberAAuth);

  // 4) MemberA joins the community
  const membershipCreateBody =
    {} satisfies ICommunityPlatformCommunityMembership.ICreate;
  const membership: ICommunityPlatformCommunityMembership =
    await api.functional.communityPlatform.communityMember.communities.memberships.create(
      connection,
      {
        communityId: community.id,
        body: membershipCreateBody,
      },
    );
  typia.assert(membership);
  // Strengthen linkage validations
  TestValidator.equals(
    "membership belongs to the target community",
    membership.community_platform_community_id,
    community.id,
  );
  TestValidator.equals(
    "membership belongs to MemberA user",
    membership.community_platform_user_id,
    memberAAuth.id,
  );

  // 5) MemberB registration/authentication (becomes current actor)
  const memberBJoinBody = {
    username: `memberB_${RandomGenerator.alphabets(8)}`,
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const memberBAuth: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(connection, {
      body: memberBJoinBody,
    });
  typia.assert(memberBAuth);

  // 6) Unauthorized deletion attempt by MemberB on MemberA's membership
  await TestValidator.error(
    "non-owner member cannot end another member's membership",
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
}
