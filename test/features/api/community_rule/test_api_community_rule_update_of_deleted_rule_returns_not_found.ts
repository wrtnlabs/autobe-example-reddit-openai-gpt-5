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
 * Updating a logically removed community rule must fail.
 *
 * Flow:
 *
 * 1. Join as a communityMember (Owner A)
 * 2. Load active categories and select one (assert list is non-empty)
 * 3. Create a community using the selected category
 * 4. Create a rule in that community
 * 5. Soft-delete the rule
 * 6. Attempt to update the deleted rule and expect an error (no status code
 *    checking)
 */
export async function test_api_community_rule_update_of_deleted_rule_returns_not_found(
  connection: api.IConnection,
) {
  // 1) Authenticate as Owner A
  const auth = await api.functional.auth.communityMember.join(connection, {
    body: {
      username: `user_${RandomGenerator.alphaNumeric(10)}`,
      email: typia.random<string & tags.Format<"email">>(),
      password: `P${RandomGenerator.alphaNumeric(11)}`,
    } satisfies ICommunityPlatformCommunityMember.ICreate,
  });
  typia.assert(auth);

  // 2) Fetch active categories
  const categoriesPage =
    await api.functional.communityPlatform.categories.index(connection, {
      body: {
        page: 1,
        limit: 20,
        active: true,
        sortBy: "display_order",
        direction: "asc",
      } satisfies ICommunityPlatformCategory.IRequest,
    });
  typia.assert(categoriesPage);

  // Ensure at least one category exists for test precondition
  TestValidator.predicate(
    "at least one active category must exist",
    categoriesPage.data.length > 0,
  );

  // Select the first category deterministically
  const category = categoriesPage.data[0];

  // 3) Create a community under the selected category
  const community =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      {
        body: {
          name: `c${RandomGenerator.alphaNumeric(10)}`,
          community_platform_category_id: category.id,
          description: RandomGenerator.paragraph({ sentences: 8 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);

  // 4) Create a rule in the community
  const rule =
    await api.functional.communityPlatform.communityMember.communities.rules.create(
      connection,
      {
        communityId: community.id,
        body: {
          order_index: 0,
          text: RandomGenerator.paragraph({ sentences: 6 }),
        } satisfies ICommunityPlatformCommunityRule.ICreate,
      },
    );
  typia.assert(rule);

  // Verify ownership linkage for sanity
  TestValidator.equals(
    "created rule belongs to the created community",
    rule.community_platform_community_id,
    community.id,
  );

  // 5) Soft-delete the rule
  await api.functional.communityPlatform.communityMember.communities.rules.erase(
    connection,
    {
      communityId: community.id,
      ruleId: rule.id,
    },
  );

  // 6) Attempt to update the deleted rule -> expect error (no specific status assert)
  await TestValidator.error(
    "updating a deleted community rule must throw",
    async () => {
      await api.functional.communityPlatform.communityMember.communities.rules.update(
        connection,
        {
          communityId: community.id,
          ruleId: rule.id,
          body: {
            text: RandomGenerator.paragraph({ sentences: 5 }),
          } satisfies ICommunityPlatformCommunityRule.IUpdate,
        },
      );
    },
  );
}
