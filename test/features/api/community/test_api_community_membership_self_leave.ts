import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformCommunityMembership } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMembership";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

export async function test_api_community_membership_self_leave(
  connection: api.IConnection,
) {
  /**
   * Validate self-termination (logical removal) of a community membership and
   * re-join ability.
   *
   * Steps:
   *
   * 1. Join as a community member (authentication) → token is set by SDK
   * 2. Create a community (requires category fixture id)
   * 3. Join the community (create membership)
   * 4. Leave the community (erase membership)
   * 5. Re-join the community (create membership again)
   *
   * Notes:
   *
   * - No roster/list API is provided, so we validate by ensuring erase completes
   *   and re-join succeeds.
   * - For re-join: either the same membership row is reactivated or a new row is
   *   created; both policies are accepted.
   */
  // 1) Authenticate (join) as a community member
  const joinBody = {
    username: RandomGenerator.name(1),
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const authorized: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(connection, {
      body: joinBody,
    });
  typia.assert(authorized);

  // 2) Create a community (immutable name, category id fixture, optional description)
  const communityName: string = `c${RandomGenerator.alphabets(6)}1`;
  const communityBody = {
    name: communityName,
    community_platform_category_id: typia.random<
      string & tags.Format<"uuid">
    >(),
    description: RandomGenerator.paragraph({ sentences: 8 }),
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community: ICommunityPlatformCommunity =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      { body: communityBody },
    );
  typia.assert(community);

  // 3) Join the community (create membership)
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
  TestValidator.equals(
    "created membership belongs to the created community",
    membership.community_platform_community_id,
    community.id,
  );
  TestValidator.predicate(
    "created membership is active (deleted_at is null or undefined)",
    membership.deleted_at === null || membership.deleted_at === undefined,
  );

  // 4) Leave the community (erase membership) - void response
  await api.functional.communityPlatform.communityMember.communities.memberships.erase(
    connection,
    {
      communityId: community.id,
      membershipId: membership.id,
    },
  );

  // 5) Re-join the community (create membership again)
  const membershipAgain: ICommunityPlatformCommunityMembership =
    await api.functional.communityPlatform.communityMember.communities.memberships.create(
      connection,
      {
        communityId: community.id,
        body: {} satisfies ICommunityPlatformCommunityMembership.ICreate,
      },
    );
  typia.assert(membershipAgain);
  TestValidator.equals(
    "re-joined membership belongs to the same community",
    membershipAgain.community_platform_community_id,
    community.id,
  );
  TestValidator.predicate(
    "re-joined membership is active (deleted_at is null or undefined)",
    membershipAgain.deleted_at === null ||
      membershipAgain.deleted_at === undefined,
  );

  // Optional: accommodate both reactivation (same id) and new row creation (different id)
  if (membershipAgain.id === membership.id) {
    TestValidator.predicate(
      "reactivated membership should have updated_at >= original updated_at",
      membershipAgain.updated_at >= membership.updated_at,
    );
  } else {
    TestValidator.notEquals(
      "re-join may produce a new membership row (id differs)",
      membershipAgain.id,
      membership.id,
    );
  }
}
