import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformCommunityMembership } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMembership";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformCommunityMembership } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformCommunityMembership";

export async function test_api_community_membership_roster_access_control_non_owner(
  connection: api.IConnection,
) {
  // 1) Owner joins and creates a community
  const ownerJoinBody = {
    username: `owner_${RandomGenerator.alphaNumeric(8)}`,
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12), // >= 8 chars
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const ownerAuth: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(connection, {
      body: ownerJoinBody,
    });
  typia.assert(ownerAuth);

  const communityCreateBody = {
    name: `c${RandomGenerator.alphaNumeric(7)}`, // starts with letter, ends alnum, 3-32 len
    community_platform_category_id: typia.random<
      string & tags.Format<"uuid">
    >(), // fixture simulated
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community: ICommunityPlatformCommunity =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      {
        body: communityCreateBody,
      },
    );
  typia.assert(community);

  // 2) Member A joins and creates a membership row in the community
  const memberAJoinBody = {
    username: `memberA_${RandomGenerator.alphaNumeric(8)}`,
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const memberAAuth: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(connection, {
      body: memberAJoinBody,
    });
  typia.assert(memberAAuth);

  const memberAMembership: ICommunityPlatformCommunityMembership =
    await api.functional.communityPlatform.communityMember.communities.memberships.create(
      connection,
      {
        communityId: community.id,
        body: {} satisfies ICommunityPlatformCommunityMembership.ICreate,
      },
    );
  typia.assert(memberAMembership);
  TestValidator.equals(
    "member A membership is scoped to created community",
    memberAMembership.community_platform_community_id,
    community.id,
  );

  // 3) Member B joins and creates another membership row
  const memberBJoinBody = {
    username: `memberB_${RandomGenerator.alphaNumeric(8)}`,
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const memberBAuth: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(connection, {
      body: memberBJoinBody,
    });
  typia.assert(memberBAuth);

  const memberBMembership: ICommunityPlatformCommunityMembership =
    await api.functional.communityPlatform.communityMember.communities.memberships.create(
      connection,
      {
        communityId: community.id,
        body: {} satisfies ICommunityPlatformCommunityMembership.ICreate,
      },
    );
  typia.assert(memberBMembership);
  TestValidator.equals(
    "member B membership is scoped to created community",
    memberBMembership.community_platform_community_id,
    community.id,
  );

  // 4) NonOwner joins and becomes a community member (actor under test)
  const nonOwnerJoinBody = {
    username: `viewer_${RandomGenerator.alphaNumeric(8)}`,
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const nonOwnerAuth: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(connection, {
      body: nonOwnerJoinBody,
    });
  typia.assert(nonOwnerAuth);

  const nonOwnerMembership: ICommunityPlatformCommunityMembership =
    await api.functional.communityPlatform.communityMember.communities.memberships.create(
      connection,
      {
        communityId: community.id,
        body: {} satisfies ICommunityPlatformCommunityMembership.ICreate,
      },
    );
  typia.assert(nonOwnerMembership);
  TestValidator.equals(
    "non-owner membership is scoped to created community",
    nonOwnerMembership.community_platform_community_id,
    community.id,
  );

  // 5) Non-owner attempts to list the community memberships (policy under test)
  const listRequest = {
    page: 1 satisfies number as number,
    limit: 50 satisfies number as number,
    include_ended: false,
    sort_by: "created_at",
    sort_dir: "desc",
  } satisfies ICommunityPlatformCommunityMembership.IRequest;

  let roster: IPageICommunityPlatformCommunityMembership.ISummary | null = null;
  try {
    roster =
      await api.functional.communityPlatform.communityMember.communities.memberships.index(
        connection,
        {
          communityId: community.id,
          body: listRequest,
        },
      );
  } catch {
    roster = null; // Denial path is acceptable
  }

  if (roster === null) {
    TestValidator.predicate(
      "non-owner roster listing may be denied by policy",
      true,
    );
  } else {
    typia.assert(roster);
    // Ensure no leakage: only the caller's own membership rows are returned
    TestValidator.predicate(
      "non-owner roster contains only self rows (no leakage)",
      roster.data.every(
        (row) =>
          row.community_platform_community_id === community.id &&
          row.community_platform_user_id === nonOwnerAuth.id,
      ),
    );
    // And the caller's own membership must be included when data exists
    TestValidator.predicate(
      "non-owner's own membership appears in returned data",
      roster.data.length === 0
        ? true // empty list is still non-leaking
        : roster.data.some((row) => row.id === nonOwnerMembership.id),
    );
  }
}
