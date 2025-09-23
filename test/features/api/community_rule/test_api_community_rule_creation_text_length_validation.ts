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
 * Validate community rule creation enforces text length constraints (1–200
 * chars).
 *
 * Workflow:
 *
 * 1. Authenticate as community member (Owner A) via join.
 * 2. List active categories and select one.
 * 3. Create a community under the selected category.
 * 4. Attempt to create rules with invalid text lengths (0 and >200) and expect
 *    failures.
 * 5. Create a valid rule with a boundary-length text (200 chars) and verify
 *    persistence.
 */
export async function test_api_community_rule_creation_text_length_validation(
  connection: api.IConnection,
) {
  // 1) Authenticate as community member (Owner A)
  const authorized = await api.functional.auth.communityMember.join(
    connection,
    {
      body: {
        username: `user_${RandomGenerator.alphaNumeric(8)}`,
        email: `${RandomGenerator.alphabets(8)}@example.com`,
        password: RandomGenerator.alphaNumeric(12),
      } satisfies ICommunityPlatformCommunityMember.ICreate,
    },
  );
  typia.assert(authorized);

  // 2) List active categories and pick one (first)
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
  TestValidator.predicate(
    "category listing returns at least one active category",
    categoriesPage.data.length > 0,
  );
  const categoryId = categoriesPage.data[0].id;

  // 3) Create a community
  const community =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      {
        body: {
          name: `c${RandomGenerator.alphaNumeric(10)}`,
          community_platform_category_id: categoryId,
          description: RandomGenerator.paragraph({ sentences: 8 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);

  // 4) Attempt invalid rule creations
  // 4-1) Empty text (length 0) → must fail
  await TestValidator.error(
    "creating rule with empty text should fail",
    async () => {
      await api.functional.communityPlatform.communityMember.communities.rules.create(
        connection,
        {
          communityId: community.id,
          body: {
            order_index: 0,
            text: "",
          } satisfies ICommunityPlatformCommunityRule.ICreate,
        },
      );
    },
  );

  // 4-2) Over 200 chars → must fail
  const overLimitText = ArrayUtil.repeat(201, () => "x").join("");
  await TestValidator.error(
    "creating rule with text over 200 chars should fail",
    async () => {
      await api.functional.communityPlatform.communityMember.communities.rules.create(
        connection,
        {
          communityId: community.id,
          body: {
            order_index: 1,
            text: overLimitText,
          } satisfies ICommunityPlatformCommunityRule.ICreate,
        },
      );
    },
  );

  // 5) Valid rule creation with boundary length (200 chars)
  const maxAllowedText = ArrayUtil.repeat(200, () => "y").join("");
  const rule =
    await api.functional.communityPlatform.communityMember.communities.rules.create(
      connection,
      {
        communityId: community.id,
        body: {
          order_index: 2,
          text: maxAllowedText,
        } satisfies ICommunityPlatformCommunityRule.ICreate,
      },
    );
  typia.assert(rule);

  // Business validations for successful creation
  TestValidator.equals(
    "rule belongs to the created community",
    rule.community_platform_community_id,
    community.id,
  );
  TestValidator.equals(
    "rule text is persisted as provided",
    rule.text,
    maxAllowedText,
  );
  TestValidator.equals("rule order_index is persisted", rule.order_index, 2);
}
