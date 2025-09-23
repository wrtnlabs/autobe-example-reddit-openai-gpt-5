import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCategory";
import type { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformCommunityRule } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityRule";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";
import type { IECategorySortBy } from "@ORGANIZATION/PROJECT-api/lib/structures/IECategorySortBy";
import type { IESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IESortDirection";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformCategory";

/**
 * Non-owner cannot create rules for a community they do not own.
 *
 * Business flow:
 *
 * 1. Create two separate auth contexts using two derived connections (ownerConn,
 *    memberConn)
 * 2. Owner A joins and authenticates, then discovers categories and creates a
 *    community
 * 3. Validate ownership and category linkage on the created community
 * 4. User B joins on a separate connection
 * 5. As User B (non-owner), attempt to create a rule in Owner A's community
 * 6. Expect an error (permission denial); do not validate specific HTTP status
 *    codes
 */
export async function test_api_community_rule_creation_by_non_owner_forbidden(
  connection: api.IConnection,
) {
  // Prepare independent connections for separate auth contexts
  const ownerConn: api.IConnection = { ...connection, headers: {} };
  const memberConn: api.IConnection = { ...connection, headers: {} };

  // 1) Owner A joins/authenticates
  const ownerJoinBody = {
    username: RandomGenerator.name(1),
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const ownerAuth: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(ownerConn, {
      body: ownerJoinBody,
    });
  typia.assert(ownerAuth);

  // 2) Discover/select an active category
  const categoryPage: IPageICommunityPlatformCategory.ISummary =
    await api.functional.communityPlatform.categories.index(ownerConn, {
      body: {
        active: true,
        sortBy: "display_order",
        direction: "asc",
      } satisfies ICommunityPlatformCategory.IRequest,
    });
  typia.assert(categoryPage);
  if (categoryPage.data.length === 0)
    throw new Error(
      "No categories found; cannot create community without a category.",
    );
  const category: ICommunityPlatformCategory.ISummary = categoryPage.data[0];

  // 3) Owner A creates a community
  const communityName: string = `${RandomGenerator.alphabets(1)}${RandomGenerator.alphaNumeric(9)}`; // 10 chars, starts with letter
  const createCommunityBody = {
    name: communityName,
    community_platform_category_id: category.id,
    description: RandomGenerator.paragraph({ sentences: 6 }),
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community: ICommunityPlatformCommunity =
    await api.functional.communityPlatform.communityMember.communities.create(
      ownerConn,
      { body: createCommunityBody },
    );
  typia.assert(community);

  // 4) Validate ownership and category linkage
  TestValidator.equals(
    "community owner id should equal owner's authenticated id",
    community.community_platform_user_id,
    ownerAuth.id,
  );
  TestValidator.equals(
    "community category id should match selected category",
    community.community_platform_category_id,
    category.id,
  );

  // 5) User B joins/authenticates on separate connection
  const memberJoinBody = {
    username: RandomGenerator.name(1),
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const memberAuth: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(memberConn, {
      body: memberJoinBody,
    });
  typia.assert(memberAuth);

  // 6) Non-owner attempts to create a rule in Owner A's community → should fail
  const ruleCreateBody = {
    order_index: 0,
    text: RandomGenerator.paragraph({ sentences: 8 }),
  } satisfies ICommunityPlatformCommunityRule.ICreate;
  await TestValidator.error(
    "non-owner must not be able to create community rule",
    async () => {
      await api.functional.communityPlatform.communityMember.communities.rules.create(
        memberConn,
        {
          communityId: community.id,
          body: ruleCreateBody,
        },
      );
    },
  );
}
