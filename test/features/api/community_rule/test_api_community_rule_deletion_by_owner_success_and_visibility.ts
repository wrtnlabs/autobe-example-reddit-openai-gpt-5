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
 * Owner deletes a community rule and the deletion effect is observable.
 *
 * This test validates the happy path for logically deleting a specific rule by
 * the community owner and checks feasible post-conditions using the available
 * SDK:
 *
 * 1. Join as a communityMember (Owner A)
 * 2. List categories and pick an active category
 * 3. Create a community under the selected category
 * 4. Create two rules (order_index: 1 and 2)
 * 5. Delete Rule #1 successfully (void response)
 * 6. Verify deletion effect:
 *
 *    - Attempt to delete Rule #1 again → expect error (already deleted/not found)
 *    - Delete Rule #2 → should succeed, demonstrating it remained unaffected
 *
 * Note: Read/list endpoints for rules are not exposed in the provided SDK.
 * Therefore, visibility is validated through permissible operations and error
 * conditions only.
 */
export async function test_api_community_rule_deletion_by_owner_success_and_visibility(
  connection: api.IConnection,
) {
  // 1) Authenticate as Owner A (communityMember)
  const joinBody = {
    username: RandomGenerator.alphabets(8),
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const owner: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(connection, {
      body: joinBody,
    });
  typia.assert(owner);

  // 2) Discover/select active category
  const categories = await api.functional.communityPlatform.categories.index(
    connection,
    {
      body: {
        page: 1,
        limit: 20,
        active: true,
        sortBy: "display_order",
        direction: "asc",
      } satisfies ICommunityPlatformCategory.IRequest,
    },
  );
  typia.assert(categories);
  await TestValidator.predicate(
    "at least one active category must exist",
    async () => categories.data.length > 0,
  );
  const category = categories.data[0];

  // 3) Create a community
  const communityBody = {
    name: RandomGenerator.alphabets(8),
    community_platform_category_id: category.id,
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community: ICommunityPlatformCommunity =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      { body: communityBody },
    );
  typia.assert(community);

  // 4) Create two rules (order_index = 1 and 2)
  const rule1Body = {
    order_index: 1,
    text: RandomGenerator.paragraph({ sentences: 5 }),
  } satisfies ICommunityPlatformCommunityRule.ICreate;
  const rule1: ICommunityPlatformCommunityRule =
    await api.functional.communityPlatform.communityMember.communities.rules.create(
      connection,
      { communityId: community.id, body: rule1Body },
    );
  typia.assert(rule1);
  TestValidator.equals(
    "rule1 belongs to the created community",
    rule1.community_platform_community_id,
    community.id,
  );

  const rule2Body = {
    order_index: 2,
    text: RandomGenerator.paragraph({ sentences: 5 }),
  } satisfies ICommunityPlatformCommunityRule.ICreate;
  const rule2: ICommunityPlatformCommunityRule =
    await api.functional.communityPlatform.communityMember.communities.rules.create(
      connection,
      { communityId: community.id, body: rule2Body },
    );
  typia.assert(rule2);
  TestValidator.equals(
    "rule2 belongs to the created community",
    rule2.community_platform_community_id,
    community.id,
  );

  // 5) Delete Rule #1 (void response expected)
  await api.functional.communityPlatform.communityMember.communities.rules.erase(
    connection,
    { communityId: community.id, ruleId: rule1.id },
  );

  // 6) Post-deletion validations
  // 6-a) Attempt to delete Rule #1 again → expect error
  await TestValidator.error(
    "deleting an already-deleted rule should error",
    async () => {
      await api.functional.communityPlatform.communityMember.communities.rules.erase(
        connection,
        { communityId: community.id, ruleId: rule1.id },
      );
    },
  );

  // 6-b) Delete Rule #2 should still succeed (remained unaffected)
  await api.functional.communityPlatform.communityMember.communities.rules.erase(
    connection,
    { communityId: community.id, ruleId: rule2.id },
  );
}
