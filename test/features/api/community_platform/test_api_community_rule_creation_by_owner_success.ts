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

export async function test_api_community_rule_creation_by_owner_success(
  connection: api.IConnection,
) {
  /**
   * Validate successful creation of a community rule by the community owner.
   *
   * Steps:
   *
   * 1. Join as communityMember (Owner A) to get authenticated session.
   * 2. Discover/select an active category (pre-existing) via categories index.
   * 3. Create a community owned by the authenticated member.
   * 4. Create a rule for the created community with unique order_index and valid
   *    text.
   *
   * Validations:
   *
   * - Category list is non-empty.
   * - Rule belongs to the created community.
   * - Rule fields (order_index, text) match the request.
   */
  // 1) Authenticate (join) as communityMember (Owner A)
  const joinBody = {
    username: `owner_${RandomGenerator.alphaNumeric(8)}`,
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12), // >= 8 chars
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const owner = await api.functional.auth.communityMember.join(connection, {
    body: joinBody,
  });
  typia.assert(owner);

  // 2) Discover/select an active category
  const categoryReq = {
    active: true,
    page: 1,
    limit: 10,
    sortBy: "display_order",
    direction: "asc",
  } satisfies ICommunityPlatformCategory.IRequest;
  const categoriesPage =
    await api.functional.communityPlatform.categories.index(connection, {
      body: categoryReq,
    });
  typia.assert(categoriesPage);
  TestValidator.predicate(
    "at least one active category must exist",
    categoriesPage.data.length > 0,
  );
  const category = typia.assert<ICommunityPlatformCategory.ISummary>(
    categoriesPage.data[0]!,
  );

  // 3) Create parent community owned by Owner A
  const communityBody = {
    name: `c${RandomGenerator.alphaNumeric(10)}`,
    community_platform_category_id: category.id,
    description: RandomGenerator.paragraph({ sentences: 6 }),
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      { body: communityBody },
    );
  typia.assert(community);

  // 4) Create a rule for the created community
  const ruleBody = {
    order_index: 0,
    text: RandomGenerator.paragraph({ sentences: 12, wordMin: 3, wordMax: 7 }), // comfortably < 200 chars
  } satisfies ICommunityPlatformCommunityRule.ICreate;
  const rule =
    await api.functional.communityPlatform.communityMember.communities.rules.create(
      connection,
      { communityId: community.id, body: ruleBody },
    );
  typia.assert(rule);

  // Business validations
  TestValidator.equals(
    "rule belongs to created community",
    rule.community_platform_community_id,
    community.id,
  );
  TestValidator.equals(
    "rule order_index equals request",
    rule.order_index,
    ruleBody.order_index,
  );
  TestValidator.equals("rule text equals request", rule.text, ruleBody.text);
}
