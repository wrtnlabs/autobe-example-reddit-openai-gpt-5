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
 * Validate paginated listing of community rules with stable ordering and page
 * boundaries.
 *
 * Business flow:
 *
 * 1. Authenticate as a community member (owner-capable) via join.
 * 2. List available categories (prefer active=true) and pick one for community
 *    creation.
 * 3. Create a community under the chosen category.
 * 4. Create 30 rules with order_index 1..30.
 * 5. List rules with page=1..3 and limit=10, ordered by order_index asc.
 * 6. Validate:
 *
 *    - Page sizes equal limit (10) each.
 *    - Strictly ascending order by order_index within each page.
 *    - No duplicates across pages; full coverage of 1..30.
 *    - Pagination metadata current page and limit are correct and records/pages are
 *         sufficient.
 */
export async function test_api_community_rules_listing_pagination_behavior(
  connection: api.IConnection,
) {
  // 1) Authenticate as community member (owner)
  const authorized = await api.functional.auth.communityMember.join(
    connection,
    {
      body: {
        username: `user_${RandomGenerator.alphabets(8)}`,
        email: typia.random<string & tags.Format<"email">>(),
        password: RandomGenerator.alphaNumeric(12),
      } satisfies ICommunityPlatformCommunityMember.ICreate,
    },
  );
  typia.assert(authorized);

  // 2) Acquire a valid category (prefer active=true)
  const categoriesActive =
    await api.functional.communityPlatform.categories.index(connection, {
      body: {
        active: true,
        limit: 5,
        sortBy: "display_order",
        direction: "asc",
      } satisfies ICommunityPlatformCategory.IRequest,
    });
  typia.assert(categoriesActive);

  let category = categoriesActive.data[0];
  if (!category) {
    const categoriesAny =
      await api.functional.communityPlatform.categories.index(connection, {
        body: { limit: 5 } satisfies ICommunityPlatformCategory.IRequest,
      });
    typia.assert(categoriesAny);
    category = categoriesAny.data[0];
  }
  if (!category)
    throw new Error("No categories available to create a community.");
  const selectedCategory =
    typia.assert<ICommunityPlatformCategory.ISummary>(category);

  // 3) Create a community
  const community =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      {
        body: {
          name: `c${RandomGenerator.alphaNumeric(9)}`,
          community_platform_category_id: selectedCategory.id,
          description: RandomGenerator.paragraph({ sentences: 6 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);

  // 4) Create 30 rules (order_index 1..30)
  const createdRules = await ArrayUtil.asyncRepeat(30, async (i) => {
    const order_index = i + 1;
    const text = RandomGenerator.paragraph({ sentences: 8 }); // short, < 200 chars
    const rule =
      await api.functional.communityPlatform.communityMember.communities.rules.create(
        connection,
        {
          communityId: community.id,
          body: {
            order_index,
            text,
          } satisfies ICommunityPlatformCommunityRule.ICreate,
        },
      );
    typia.assert(rule);
    return rule;
  });
  TestValidator.equals("created exactly 30 rules", createdRules.length, 30);

  // 5) List rules across 3 pages
  const PAGE_SIZE = 10;
  const page1 = await api.functional.communityPlatform.communities.rules.index(
    connection,
    {
      communityId: community.id,
      body: {
        page: 1,
        limit: PAGE_SIZE,
        orderBy: "order_index",
        direction: "asc",
      } satisfies ICommunityPlatformCommunityRule.IRequest,
    },
  );
  typia.assert(page1);

  const page2 = await api.functional.communityPlatform.communities.rules.index(
    connection,
    {
      communityId: community.id,
      body: {
        page: 2,
        limit: PAGE_SIZE,
        orderBy: "order_index",
        direction: "asc",
      } satisfies ICommunityPlatformCommunityRule.IRequest,
    },
  );
  typia.assert(page2);

  const page3 = await api.functional.communityPlatform.communities.rules.index(
    connection,
    {
      communityId: community.id,
      body: {
        page: 3,
        limit: PAGE_SIZE,
        orderBy: "order_index",
        direction: "asc",
      } satisfies ICommunityPlatformCommunityRule.IRequest,
    },
  );
  typia.assert(page3);

  // 6) Validations
  TestValidator.equals(
    "page 1 size equals limit",
    page1.data.length,
    PAGE_SIZE,
  );
  TestValidator.equals(
    "page 2 size equals limit",
    page2.data.length,
    PAGE_SIZE,
  );
  TestValidator.equals(
    "page 3 size equals limit",
    page3.data.length,
    PAGE_SIZE,
  );

  const isStrictAsc = (arr: ICommunityPlatformCommunityRule[]) =>
    arr.every((v, idx, a) =>
      idx === 0 ? true : a[idx - 1].order_index < v.order_index,
    );

  TestValidator.predicate(
    "page 1 strictly sorted by order_index asc",
    isStrictAsc(page1.data),
  );
  TestValidator.predicate(
    "page 2 strictly sorted by order_index asc",
    isStrictAsc(page2.data),
  );
  TestValidator.predicate(
    "page 3 strictly sorted by order_index asc",
    isStrictAsc(page3.data),
  );

  // first/last indices per page
  const first1 = page1.data[0]?.order_index;
  const last1 = page1.data[PAGE_SIZE - 1]?.order_index;
  const first2 = page2.data[0]?.order_index;
  const last2 = page2.data[PAGE_SIZE - 1]?.order_index;
  const first3 = page3.data[0]?.order_index;
  const last3 = page3.data[PAGE_SIZE - 1]?.order_index;

  TestValidator.equals("page 1 first index", first1, 1);
  TestValidator.equals("page 1 last index", last1, 10);
  TestValidator.equals("page 2 first index", first2, 11);
  TestValidator.equals("page 2 last index", last2, 20);
  TestValidator.equals("page 3 first index", first3, 21);
  TestValidator.equals("page 3 last index", last3, 30);

  // No duplicates across pages and full coverage 1..30
  const combined = [...page1.data, ...page2.data, ...page3.data];
  const idSet = new Set(combined.map((r) => r.id));
  TestValidator.equals(
    "unique id count equals total count",
    idSet.size,
    combined.length,
  );

  const ascOrders = combined.map((r) => r.order_index).sort((a, b) => a - b);
  const expectedOrders = ArrayUtil.repeat(30, (i) => i + 1);
  TestValidator.equals(
    "complete coverage of order_index 1..30",
    ascOrders,
    expectedOrders,
  );

  // Pagination metadata sanity
  TestValidator.equals("page1 current=1", page1.pagination.current, 1);
  TestValidator.equals("page2 current=2", page2.pagination.current, 2);
  TestValidator.equals("page3 current=3", page3.pagination.current, 3);
  TestValidator.equals(
    "pagination limit=10 page1",
    page1.pagination.limit,
    PAGE_SIZE,
  );
  TestValidator.equals(
    "pagination limit=10 page2",
    page2.pagination.limit,
    PAGE_SIZE,
  );
  TestValidator.equals(
    "pagination limit=10 page3",
    page3.pagination.limit,
    PAGE_SIZE,
  );
  TestValidator.predicate(
    "records >= 30 in this community",
    page1.pagination.records >= 30 &&
      page2.pagination.records >= 30 &&
      page3.pagination.records >= 30,
  );
  TestValidator.predicate(
    "total pages >= 3 for this dataset",
    page1.pagination.pages >= 3 &&
      page2.pagination.pages >= 3 &&
      page3.pagination.pages >= 3,
  );
}
