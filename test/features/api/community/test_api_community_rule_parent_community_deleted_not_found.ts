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

export async function test_api_community_rule_parent_community_deleted_not_found(
  connection: api.IConnection,
) {
  // Authenticate as community member (owner)
  const joinBody = {
    username: `user_${RandomGenerator.alphaNumeric(8)}`,
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const authorized: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(connection, {
      body: joinBody,
    });
  typia.assert(authorized);

  // Select an active category
  const categoryReq = {
    page: 1,
    limit: 5,
    active: true,
    sortBy: "display_order",
    direction: "asc",
  } satisfies ICommunityPlatformCategory.IRequest;
  const categoriesPage: IPageICommunityPlatformCategory.ISummary =
    await api.functional.communityPlatform.categories.index(connection, {
      body: categoryReq,
    });
  typia.assert(categoriesPage);
  if (categoriesPage.data.length === 0) {
    throw new Error("No active categories exist to create a community.");
  }
  const selectedCategory = categoriesPage.data[0];

  // Create a community
  const communityName = `c${RandomGenerator.alphaNumeric(9)}`;
  const communityBody = {
    name: communityName,
    community_platform_category_id: selectedCategory.id,
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community: ICommunityPlatformCommunity =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      {
        body: communityBody,
      },
    );
  typia.assert(community);
  TestValidator.equals(
    "community owner is the authenticated user",
    community.community_platform_user_id,
    authorized.id,
  );
  TestValidator.equals(
    "community category matches selected category",
    community.community_platform_category_id,
    selectedCategory.id,
  );

  // Create a rule within the community
  const ruleBody = {
    order_index: 0,
    text: RandomGenerator.paragraph({ sentences: 6, wordMin: 3, wordMax: 8 }),
  } satisfies ICommunityPlatformCommunityRule.ICreate;
  const rule: ICommunityPlatformCommunityRule =
    await api.functional.communityPlatform.communityMember.communities.rules.create(
      connection,
      {
        communityId: community.id,
        body: ruleBody,
      },
    );
  typia.assert(rule);
  TestValidator.equals(
    "rule is linked to the community",
    rule.community_platform_community_id,
    community.id,
  );

  // Baseline: read the rule before deletion to confirm accessibility
  const beforeDeletion: ICommunityPlatformCommunityRule =
    await api.functional.communityPlatform.communities.rules.at(connection, {
      communityId: community.id,
      ruleId: rule.id,
    });
  typia.assert(beforeDeletion);
  TestValidator.equals(
    "pre-deletion fetch returns same rule id",
    beforeDeletion.id,
    rule.id,
  );

  // Logically delete the parent community
  await api.functional.communityPlatform.communityMember.communities.erase(
    connection,
    {
      communityId: community.id,
    },
  );

  // After deletion, the rule must not be retrievable
  await TestValidator.error(
    "rule retrieval must fail after parent community deletion",
    async () => {
      await api.functional.communityPlatform.communities.rules.at(connection, {
        communityId: community.id,
        ruleId: rule.id,
      });
    },
  );
}
