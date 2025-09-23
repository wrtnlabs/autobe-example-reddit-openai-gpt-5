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
import type { IECommunityPlatformCommunityRuleOrderBy } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformCommunityRuleOrderBy";
import type { IESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IESortDirection";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformCategory";
import type { IPageICommunityPlatformCommunityRule } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformCommunityRule";

/**
 * Community rules listing: order and visibility.
 *
 * Goal
 *
 * - Ensure that listing community rules returns active items in deterministic
 *   order: primarily by order_index ascending (with created_at as stable
 *   tiebreaker).
 *
 * Flow
 *
 * 1. Join as a community member (becomes owner of resources created).
 * 2. Fetch an active category to attach to the new community.
 * 3. Create a community within that category.
 * 4. Create two rules with order_index 2 and 1 (in that creation order) so the
 *    second rule has newer created_at.
 * 5. List rules with default/explicit ordering and verify:
 *
 *    - Order_index=1 appears before order_index=2
 *    - All rows belong to the created community
 *    - Pagination metadata is consistent (limit respected, records >= data.length,
 *         pages >= 1)
 */
export async function test_api_community_rules_listing_order_and_visibility(
  connection: api.IConnection,
) {
  // 1) Join as community member (owner)
  const auth = await api.functional.auth.communityMember.join(connection, {
    body: {
      username: `${RandomGenerator.name(1)}_${RandomGenerator.alphaNumeric(6)}`,
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12), // >= 8 chars
    } satisfies ICommunityPlatformCommunityMember.ICreate,
  });
  typia.assert(auth);

  // 2) Fetch an active category (page 1, smallest display_order first)
  const categoryPage = await api.functional.communityPlatform.categories.index(
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
  typia.assert(categoryPage);
  TestValidator.predicate(
    "there should be at least one active category",
    categoryPage.data.length > 0,
  );
  const category = categoryPage.data[0];

  // 3) Create a community in the selected category
  const communityName = `c-${RandomGenerator.alphaNumeric(8)}-${RandomGenerator.alphaNumeric(6)}`; // 3-32 chars, starts with letter, ends alnum
  const community =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      {
        body: {
          name: communityName,
          community_platform_category_id: category.id,
          description: RandomGenerator.paragraph({ sentences: 6 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);
  TestValidator.equals(
    "community uses selected category",
    community.community_platform_category_id,
    category.id,
  );

  // Helper to keep text length within 200 chars
  const makeRuleText = (): string => {
    const base = RandomGenerator.paragraph({
      sentences: 8,
      wordMin: 3,
      wordMax: 6,
    });
    return base.length > 200 ? base.slice(0, 200) : base;
  };

  // 4) Create two rules: first order_index=2, then order_index=1 (newer)
  const rule2 =
    await api.functional.communityPlatform.communityMember.communities.rules.create(
      connection,
      {
        communityId: community.id,
        body: {
          order_index: 2,
          text: makeRuleText(),
        } satisfies ICommunityPlatformCommunityRule.ICreate,
      },
    );
  typia.assert(rule2);

  const rule1 =
    await api.functional.communityPlatform.communityMember.communities.rules.create(
      connection,
      {
        communityId: community.id,
        body: {
          order_index: 1,
          text: makeRuleText(),
        } satisfies ICommunityPlatformCommunityRule.ICreate,
      },
    );
  typia.assert(rule1);

  // 5) List rules with explicit ordering: order_index asc
  const listExplicit =
    await api.functional.communityPlatform.communities.rules.index(connection, {
      communityId: community.id,
      body: {
        page: 1,
        limit: 10,
        orderBy: "order_index",
        direction: "asc",
      } satisfies ICommunityPlatformCommunityRule.IRequest,
    });
  typia.assert(listExplicit);
  TestValidator.predicate(
    "list contains at least the two created rules",
    listExplicit.data.length >= 2,
  );
  // All results must belong to the community
  TestValidator.predicate(
    "every returned rule belongs to target community",
    listExplicit.data.every(
      (r) => r.community_platform_community_id === community.id,
    ),
  );
  // Deterministic order: order_index=1 should appear before order_index=2
  TestValidator.equals(
    "first rule order_index should be 1 (ascending by order_index)",
    listExplicit.data[0].order_index,
    1,
  );
  TestValidator.equals(
    "second rule order_index should be 2 (ascending by order_index)",
    listExplicit.data[1].order_index,
    2,
  );
  // Verify that the specific ids match expected order
  TestValidator.equals(
    "the head item should be the rule created with order_index=1",
    listExplicit.data[0].id,
    rule1.id,
  );

  // Pagination metadata consistency
  TestValidator.predicate(
    "page size should not exceed requested limit",
    listExplicit.data.length <= 10,
  );
  TestValidator.predicate(
    "records should be >= number of returned items",
    listExplicit.pagination.records >= listExplicit.data.length,
  );
  TestValidator.predicate(
    "pages should be at least 1",
    listExplicit.pagination.pages >= 1,
  );
  TestValidator.predicate(
    "current page index should be non-negative",
    listExplicit.pagination.current >= 0,
  );

  // Also verify default ordering (omitting orderBy/direction) yields same head
  const listDefault =
    await api.functional.communityPlatform.communities.rules.index(connection, {
      communityId: community.id,
      body: {
        page: 1,
        limit: 10,
      } satisfies ICommunityPlatformCommunityRule.IRequest,
    });
  typia.assert(listDefault);
  TestValidator.predicate(
    "default listing should contain items",
    listDefault.data.length >= 1,
  );
  TestValidator.equals(
    "default ordering places order_index=1 first",
    listDefault.data[0].id,
    rule1.id,
  );
}
