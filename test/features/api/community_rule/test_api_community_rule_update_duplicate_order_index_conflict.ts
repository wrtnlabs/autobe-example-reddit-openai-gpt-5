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
 * Updating a rule to a duplicate order_index must fail.
 *
 * Flow:
 *
 * 1. Join as communityMember (Owner A) → authenticated session.
 * 2. Fetch active categories and select one.
 * 3. Create a community in the chosen category.
 * 4. Create Rule #1 (order_index = 1) and Rule #2 (order_index = 2).
 * 5. Attempt to update Rule #2’s order_index to 1 and expect an error.
 */
export async function test_api_community_rule_update_duplicate_order_index_conflict(
  connection: api.IConnection,
) {
  // 1) Auth as Owner A (join)
  const authorized: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(connection, {
      body: {
        username: `user_${RandomGenerator.alphaNumeric(12)}`,
        email: typia.random<string & tags.Format<"email">>(),
        password: RandomGenerator.alphaNumeric(12),
      } satisfies ICommunityPlatformCommunityMember.ICreate,
    });
  typia.assert(authorized);

  // 2) Discover/select active category
  const categories = await api.functional.communityPlatform.categories.index(
    connection,
    {
      body: {
        page: 1,
        limit: 10,
        active: true,
        sortBy: "display_order",
        direction: "asc",
      } satisfies ICommunityPlatformCategory.IRequest,
    },
  );
  typia.assert(categories);
  TestValidator.predicate(
    "at least one active category exists",
    categories.data.length > 0,
  );
  const category = categories.data[0];

  // 3) Create the parent community
  const communityName = `c${RandomGenerator.alphaNumeric(7)}`; // starts with letter, length >= 3
  const community: ICommunityPlatformCommunity =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      {
        body: {
          name: communityName,
          community_platform_category_id: category.id,
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);
  TestValidator.equals(
    "community categorized under chosen category",
    community.community_platform_category_id,
    category.id,
  );

  // 4) Create Rule #1 and Rule #2
  const rule1: ICommunityPlatformCommunityRule =
    await api.functional.communityPlatform.communityMember.communities.rules.create(
      connection,
      {
        communityId: community.id,
        body: {
          order_index: 1,
          text: RandomGenerator.paragraph({ sentences: 6 }),
        } satisfies ICommunityPlatformCommunityRule.ICreate,
      },
    );
  typia.assert(rule1);
  TestValidator.equals(
    "rule1 belongs to community",
    rule1.community_platform_community_id,
    community.id,
  );
  TestValidator.equals("rule1 order_index is 1", rule1.order_index, 1);

  const rule2: ICommunityPlatformCommunityRule =
    await api.functional.communityPlatform.communityMember.communities.rules.create(
      connection,
      {
        communityId: community.id,
        body: {
          order_index: 2,
          text: RandomGenerator.paragraph({ sentences: 6 }),
        } satisfies ICommunityPlatformCommunityRule.ICreate,
      },
    );
  typia.assert(rule2);
  TestValidator.equals(
    "rule2 belongs to community",
    rule2.community_platform_community_id,
    community.id,
  );
  TestValidator.equals("rule2 order_index is 2", rule2.order_index, 2);

  // 5) Attempt to update Rule #2 to duplicate order_index = 1 → expect error
  await TestValidator.error(
    "updating rule2 to duplicate order_index 1 must fail",
    async () => {
      await api.functional.communityPlatform.communityMember.communities.rules.update(
        connection,
        {
          communityId: community.id,
          ruleId: rule2.id,
          body: {
            order_index: 1,
          } satisfies ICommunityPlatformCommunityRule.IUpdate,
        },
      );
    },
  );
}
