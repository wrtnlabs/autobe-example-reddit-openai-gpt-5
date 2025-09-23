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
 * Non-owner must not be able to update a community rule.
 *
 * Steps:
 *
 * 1. Join as Owner A (communityMember role)
 * 2. Discover an active category
 * 3. Create a community under Owner A
 * 4. Create a community rule under that community
 * 5. Join as User B (non-owner) to switch auth context
 * 6. Attempt to update the rule as User B → expect error
 *
 * Note: No retrieval API for the rule is provided, so we assert the forbidden
 * update behavior via TestValidator.error without fetching the rule again.
 */
export async function test_api_community_rule_update_by_non_owner_forbidden(
  connection: api.IConnection,
) {
  // 1) Join as Owner A
  const ownerAJoinBody = {
    username: `owner_${RandomGenerator.alphabets(10)}`,
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const ownerA = await api.functional.auth.communityMember.join(connection, {
    body: ownerAJoinBody,
  });
  typia.assert(ownerA);

  // 2) Discover an active category
  const categories = await api.functional.communityPlatform.categories.index(
    connection,
    {
      body: {
        active: true,
        page: 1,
        limit: 20,
        sortBy: "display_order",
        direction: "asc",
      } satisfies ICommunityPlatformCategory.IRequest,
    },
  );
  typia.assert(categories);
  TestValidator.predicate(
    "active categories available",
    categories.data.length > 0,
  );
  const category = categories.data.find((c) => c.active) ?? categories.data[0];
  typia.assertGuard(category!);

  // 3) Create a community as Owner A
  const communityName = `c${RandomGenerator.alphaNumeric(8)}`; // matches name pattern
  const communityBody = {
    name: communityName,
    community_platform_category_id: category.id,
    description: RandomGenerator.paragraph({ sentences: 6 }),
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      { body: communityBody },
    );
  typia.assert(community);
  TestValidator.equals(
    "community owner should be Owner A",
    community.community_platform_user_id,
    ownerA.id,
  );

  // 4) Create a rule
  const createRuleBody = {
    order_index: 0,
    text: RandomGenerator.paragraph({ sentences: 6 }),
  } satisfies ICommunityPlatformCommunityRule.ICreate;
  const rule =
    await api.functional.communityPlatform.communityMember.communities.rules.create(
      connection,
      { communityId: community.id, body: createRuleBody },
    );
  typia.assert(rule);
  TestValidator.equals(
    "rule should belong to created community",
    rule.community_platform_community_id,
    community.id,
  );

  // 5) Join as User B (switch auth context)
  const userBJoinBody = {
    username: `user_${RandomGenerator.alphabets(10)}`,
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const userB = await api.functional.auth.communityMember.join(connection, {
    body: userBJoinBody,
  });
  typia.assert(userB);
  TestValidator.notEquals(
    "user B and owner A must be different accounts",
    userB.id,
    ownerA.id,
  );

  // 6) Attempt to update the rule as non-owner → should error
  const updateBody = {
    order_index: 1,
    text: RandomGenerator.paragraph({ sentences: 5 }),
  } satisfies ICommunityPlatformCommunityRule.IUpdate;
  await TestValidator.error(
    "non-owner cannot update community rule",
    async () => {
      await api.functional.communityPlatform.communityMember.communities.rules.update(
        connection,
        {
          communityId: community.id,
          ruleId: rule.id,
          body: updateBody,
        },
      );
    },
  );
}
