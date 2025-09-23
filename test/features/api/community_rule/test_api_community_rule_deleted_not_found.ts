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
 * Ensure a logically removed community rule cannot be retrieved by public read.
 *
 * Flow overview:
 *
 * 1. Join as a community member (auth token auto-attached by SDK)
 * 2. List an active category to attach new community
 * 3. Create a community under that category
 * 4. Create a rule for the community
 * 5. Logically remove (soft delete) the rule
 * 6. Attempt public GET for the deleted rule and assert error
 *
 * Notes:
 *
 * - Do not validate HTTP status codes; only assert that an error occurs
 * - All request bodies use `satisfies` for type safety
 * - All non-void API responses are validated with typia.assert()
 */
export async function test_api_community_rule_deleted_not_found(
  connection: api.IConnection,
) {
  // 1) Join as community member
  const joinBody = {
    username: RandomGenerator.name(1),
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const authorized = await api.functional.auth.communityMember.join(
    connection,
    {
      body: joinBody,
    },
  );
  typia.assert(authorized);

  // 2) Obtain an active category
  const categoryPage = await api.functional.communityPlatform.categories.index(
    connection,
    {
      body: {
        active: true,
        limit: 1,
      } satisfies ICommunityPlatformCategory.IRequest,
    },
  );
  typia.assert(categoryPage);
  if (categoryPage.data.length === 0)
    throw new Error("No active category available for community creation");
  const categoryId = categoryPage.data[0].id;

  // 3) Create a community (name pattern: starts with letter, alnum for rest)
  const communityName = `${RandomGenerator.alphabets(1)}${RandomGenerator.alphaNumeric(9)}`;
  const communityInput = {
    name: communityName,
    community_platform_category_id: categoryId,
    description: RandomGenerator.paragraph({ sentences: 8 }),
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      { body: communityInput },
    );
  typia.assert(community);

  // 4) Create a community rule
  const ruleInput = {
    order_index: 0,
    text: RandomGenerator.paragraph({ sentences: 6 }),
  } satisfies ICommunityPlatformCommunityRule.ICreate;
  const rule =
    await api.functional.communityPlatform.communityMember.communities.rules.create(
      connection,
      { communityId: community.id, body: ruleInput },
    );
  typia.assert(rule);

  // Verify ownership linkage
  TestValidator.equals(
    "created rule belongs to the created community",
    rule.community_platform_community_id,
    community.id,
  );

  // 5) Logically remove (soft-delete) the rule
  await api.functional.communityPlatform.communityMember.communities.rules.erase(
    connection,
    { communityId: community.id, ruleId: rule.id },
  );

  // 6) Public GET must fail after logical deletion
  await TestValidator.error(
    "deleted rule is not retrievable by public GET",
    async () => {
      await api.functional.communityPlatform.communities.rules.at(connection, {
        communityId: community.id,
        ruleId: rule.id,
      });
    },
  );
}
