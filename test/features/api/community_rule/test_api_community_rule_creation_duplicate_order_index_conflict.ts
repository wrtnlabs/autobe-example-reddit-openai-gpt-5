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

export async function test_api_community_rule_creation_duplicate_order_index_conflict(
  connection: api.IConnection,
) {
  /**
   * Validate that creating a second rule with a duplicate order_index in the
   * same community fails, while the initial creation succeeds.
   *
   * Steps:
   *
   * 1. Authenticate as community member (Owner A)
   * 2. Discover an active category
   * 3. Create a community under the active category
   * 4. Create Rule #1 with order_index = 1 (success)
   * 5. Attempt to create another rule with order_index = 1 (should error)
   *
   * Notes:
   *
   * - We rely on existing active categories. If none exist, the test fails with a
   *   descriptive assertion asking to seed categories.
   * - We do not validate HTTP status codes or error messages; only the fact that
   *   an error occurs on the duplicate attempt.
   */

  // 1) Authenticate as community member (Owner A)
  const joinOutput = await api.functional.auth.communityMember.join(
    connection,
    {
      body: {
        username: `owner_${RandomGenerator.alphaNumeric(10)}`,
        email: typia.random<string & tags.Format<"email">>(),
        password: `${RandomGenerator.alphaNumeric(8)}${RandomGenerator.alphaNumeric(4)}`,
      } satisfies ICommunityPlatformCommunityMember.ICreate,
    },
  );
  typia.assert(joinOutput);

  // 2) Discover an active category
  const categoriesPage =
    await api.functional.communityPlatform.categories.index(connection, {
      body: {
        active: true,
        sortBy: "display_order",
        direction: "asc",
      } satisfies ICommunityPlatformCategory.IRequest,
    });
  typia.assert(categoriesPage);
  TestValidator.predicate(
    "at least one active category must exist for community creation",
    categoriesPage.data.length > 0,
  );
  const maybeCategory = categoriesPage.data[0];
  typia.assertGuard<ICommunityPlatformCategory.ISummary>(maybeCategory!);
  const category = maybeCategory;

  // 3) Create a community under the active category
  const communityName = `c${RandomGenerator.alphaNumeric(8)}1`;
  const community =
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
    "community references selected category",
    community.community_platform_category_id,
    category.id,
  );

  // 4) Create Rule #1 with order_index = 1 (success)
  const rule1 =
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

  // 5) Attempt to create another rule with the same order_index (should fail)
  await TestValidator.error(
    "duplicate order_index within same community should fail",
    async () => {
      await api.functional.communityPlatform.communityMember.communities.rules.create(
        connection,
        {
          communityId: community.id,
          body: {
            order_index: 1,
            text: RandomGenerator.paragraph({ sentences: 5 }),
          } satisfies ICommunityPlatformCommunityRule.ICreate,
        },
      );
    },
  );
}
