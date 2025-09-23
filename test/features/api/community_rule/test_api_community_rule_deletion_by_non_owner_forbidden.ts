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

export async function test_api_community_rule_deletion_by_non_owner_forbidden(
  connection: api.IConnection,
) {
  /**
   * Validate that a non-owner cannot delete a community rule.
   *
   * Steps:
   *
   * 1. Register Owner A and authenticate (SDK sets Authorization automatically).
   * 2. Discover an active category to satisfy community creation requirements.
   * 3. Create a community as Owner A.
   * 4. Create a rule under that community as Owner A.
   * 5. Register User B (switch auth context to a non-owner).
   * 6. Attempt to delete the rule as User B → expect error (forbidden).
   *
   * Note: GET/list rule verification is omitted due to unavailable APIs in the
   * provided SDK set; the business rule is validated through the forbidden
   * deletion attempt.
   */

  // 1) Register Owner A
  const ownerUsername = `owner_${RandomGenerator.alphaNumeric(12)}`;
  const ownerEmail = typia.random<string & tags.Format<"email">>();
  const ownerAuth = await api.functional.auth.communityMember.join(connection, {
    body: {
      username: ownerUsername,
      email: ownerEmail,
      password: RandomGenerator.alphaNumeric(12), // >= 8 chars
    } satisfies ICommunityPlatformCommunityMember.ICreate,
  });
  typia.assert(ownerAuth);

  // 2) Discover an active category (needed to create a community)
  const categoriesPage =
    await api.functional.communityPlatform.categories.index(connection, {
      body: {
        page: 1,
        limit: 10,
        active: true,
        sortBy: "display_order",
        direction: "asc",
      } satisfies ICommunityPlatformCategory.IRequest,
    });
  typia.assert(categoriesPage);
  await TestValidator.predicate(
    "at least one active category must be available",
    async () => categoriesPage.data.length > 0,
  );
  const categoryId = categoriesPage.data[0]!.id;

  // 3) Create a community as Owner A
  const communityName = `c${RandomGenerator.alphaNumeric(10)}`; // starts with letter, 3-32 chars
  const community =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      {
        body: {
          name: communityName,
          community_platform_category_id: categoryId,
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);

  // 4) Create a rule under the community as Owner A
  const rule =
    await api.functional.communityPlatform.communityMember.communities.rules.create(
      connection,
      {
        communityId: community.id,
        body: {
          order_index: 0,
          text: RandomGenerator.paragraph({ sentences: 5 }), // ensure < 200 chars
        } satisfies ICommunityPlatformCommunityRule.ICreate,
      },
    );
  typia.assert(rule);
  TestValidator.equals(
    "created rule must belong to the created community",
    rule.community_platform_community_id,
    community.id,
  );

  // 5) Switch auth context to User B (non-owner)
  const userBUsername = `user_${RandomGenerator.alphaNumeric(12)}`;
  const userBEmail = typia.random<string & tags.Format<"email">>();
  const userBAuth = await api.functional.auth.communityMember.join(connection, {
    body: {
      username: userBUsername,
      email: userBEmail,
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ICommunityPlatformCommunityMember.ICreate,
  });
  typia.assert(userBAuth);

  // 6) Attempt to delete the rule as non-owner and expect failure
  await TestValidator.error(
    "non-owner should be forbidden to delete a community rule",
    async () => {
      await api.functional.communityPlatform.communityMember.communities.rules.erase(
        connection,
        {
          communityId: community.id,
          ruleId: rule.id,
        },
      );
    },
  );
}
