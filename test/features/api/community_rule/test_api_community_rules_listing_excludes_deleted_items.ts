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
 * Verify that listing community rules excludes soft-deleted items.
 *
 * Steps:
 *
 * 1. Join as a community member (owner-capable)
 * 2. List categories and pick one (prefer active)
 * 3. Create a new community under the selected category
 * 4. Create two rules (R1, R2)
 * 5. Soft-delete R1
 * 6. List rules for the community and validate:
 *
 *    - R1 is excluded
 *    - R2 remains present
 *    - Pagination/count reflects only non-deleted items
 */
export async function test_api_community_rules_listing_excludes_deleted_items(
  connection: api.IConnection,
) {
  // 1) Authenticate as community member (owner-capable)
  const auth = await api.functional.auth.communityMember.join(connection, {
    body: {
      username: RandomGenerator.alphabets(10),
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ICommunityPlatformCommunityMember.ICreate,
  });
  typia.assert(auth);

  // 2) Fetch an active category first; if empty, fallback to any category
  const activeCategories =
    await api.functional.communityPlatform.categories.index(connection, {
      body: {
        active: true,
        limit: 50,
        sortBy: "display_order",
        direction: "asc",
      } satisfies ICommunityPlatformCategory.IRequest,
    });
  typia.assert(activeCategories);

  let chosenCategory = activeCategories.data[0];
  if (!chosenCategory) {
    const anyCategories =
      await api.functional.communityPlatform.categories.index(connection, {
        body: {
          limit: 50,
          sortBy: "display_order",
          direction: "asc",
        } satisfies ICommunityPlatformCategory.IRequest,
      });
    typia.assert(anyCategories);
    chosenCategory = anyCategories.data[0];
    TestValidator.predicate(
      "category list must not be empty",
      () => anyCategories.data.length > 0,
    );
  } else {
    TestValidator.predicate(
      "active category list must not be empty",
      () => activeCategories.data.length > 0,
    );
  }
  // Narrow chosenCategory for safe usage
  typia.assertGuard(chosenCategory!);

  // 3) Create a new community
  const communityName = `c${RandomGenerator.alphaNumeric(12)}`; // starts with a letter, ends alphanumeric, 3-32 chars
  const community =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      {
        body: {
          name: communityName,
          community_platform_category_id: chosenCategory.id,
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);

  // 4) Create two rules (R1 with order_index=0, R2 with order_index=1)
  const r1 =
    await api.functional.communityPlatform.communityMember.communities.rules.create(
      connection,
      {
        communityId: community.id,
        body: {
          order_index: 0,
          text:
            RandomGenerator.paragraph({ sentences: 8 }).slice(0, 180) ||
            "rule-1",
        } satisfies ICommunityPlatformCommunityRule.ICreate,
      },
    );
  typia.assert(r1);

  const r2 =
    await api.functional.communityPlatform.communityMember.communities.rules.create(
      connection,
      {
        communityId: community.id,
        body: {
          order_index: 1,
          text:
            RandomGenerator.paragraph({ sentences: 8 }).slice(0, 180) ||
            "rule-2",
        } satisfies ICommunityPlatformCommunityRule.ICreate,
      },
    );
  typia.assert(r2);

  // Sanity: rules belong to the community
  TestValidator.equals(
    "R1 belongs to created community",
    r1.community_platform_community_id,
    community.id,
  );
  TestValidator.equals(
    "R2 belongs to created community",
    r2.community_platform_community_id,
    community.id,
  );

  // 5) Soft-delete R1
  await api.functional.communityPlatform.communityMember.communities.rules.erase(
    connection,
    { communityId: community.id, ruleId: r1.id },
  );

  // 6) List rules and validate exclusions/pagination
  const page = await api.functional.communityPlatform.communities.rules.index(
    connection,
    {
      communityId: community.id,
      body: {
        page: 1,
        limit: 100,
        orderBy: "order_index",
        direction: "asc",
      } satisfies ICommunityPlatformCommunityRule.IRequest,
    },
  );
  typia.assert(page);

  // Deleted rule must not appear
  TestValidator.predicate("deleted rule (R1) is excluded from listing", () =>
    page.data.every((rule) => rule.id !== r1.id),
  );

  // R2 must exist in the result
  const kept = page.data.find((rule) => rule.id === r2.id);
  TestValidator.predicate(
    "R2 must exist in the listing",
    () => kept !== undefined,
  );
  if (kept) {
    // Narrow `kept` to non-nullable for subsequent property access
    typia.assertGuard(kept!);
    TestValidator.equals("kept rule id equals R2", kept.id, r2.id);
    TestValidator.equals(
      "kept rule belongs to the community",
      kept.community_platform_community_id,
      community.id,
    );
  }

  // All returned rules must belong to the community
  TestValidator.predicate(
    "all returned rules belong to the target community",
    () =>
      page.data.every(
        (rule) => rule.community_platform_community_id === community.id,
      ),
  );

  // Pagination/count reflects only non-deleted items
  TestValidator.equals(
    "pagination.records equals number of returned items",
    page.pagination.records,
    page.data.length,
  );
  TestValidator.equals(
    "after deletion only one rule remains",
    page.data.length,
    1,
  );
}
