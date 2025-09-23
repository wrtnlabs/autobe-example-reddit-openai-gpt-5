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

export async function test_api_community_rule_update_by_owner_success(
  connection: api.IConnection,
) {
  /**
   * E2E: Owner updates a community rule successfully.
   *
   * Steps:
   *
   * 1. Join as communityMember (Owner A)
   * 2. Discover/select an active category
   * 3. Create a community under the selected category
   * 4. Create a rule within the community
   * 5. Update the rule (order_index and text)
   * 6. Validate updated fields, updated_at change, ownership association, and
   *    stable rule id
   */
  // 1) Join as communityMember (Owner A)
  const auth = await api.functional.auth.communityMember.join(connection, {
    body: {
      username: `user_${RandomGenerator.alphaNumeric(8)}`,
      email: typia.random<string & tags.Format<"email">>(),
      password: `P${RandomGenerator.alphaNumeric(11)}`,
    } satisfies ICommunityPlatformCommunityMember.ICreate,
  });
  typia.assert(auth);

  // 2) Discover/select an active category
  const page = await api.functional.communityPlatform.categories.index(
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
  typia.assert(page);
  TestValidator.predicate(
    "at least one active category exists",
    page.data.length > 0,
  );
  const category = page.data[0];

  // 3) Create a community
  const communityName = `${RandomGenerator.alphabets(8)}`; // 3-32, starts letter, ends alnum
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

  // 4) Create a rule within the community
  const createRuleBody = {
    order_index: typia.random<number & tags.Type<"int32"> & tags.Minimum<0>>(),
    text: RandomGenerator.paragraph({ sentences: 10 }),
  } satisfies ICommunityPlatformCommunityRule.ICreate;
  const rule =
    await api.functional.communityPlatform.communityMember.communities.rules.create(
      connection,
      {
        communityId: community.id,
        body: createRuleBody,
      },
    );
  typia.assert(rule);

  // Keep pre-update snapshots for comparisons
  const beforeUpdatedAt = rule.updated_at;
  const beforeRuleId = rule.id;
  const beforeCommunityId = rule.community_platform_community_id;

  // 5) Update the rule (both order_index and text)
  const newOrderIndex = typia.random<
    number & tags.Type<"int32"> & tags.Minimum<0>
  >();
  const newText = RandomGenerator.paragraph({ sentences: 12 });
  const updated =
    await api.functional.communityPlatform.communityMember.communities.rules.update(
      connection,
      {
        communityId: community.id,
        ruleId: rule.id,
        body: {
          order_index: newOrderIndex,
          text: newText,
        } satisfies ICommunityPlatformCommunityRule.IUpdate,
      },
    );
  typia.assert(updated);

  // 6) Validations
  TestValidator.equals(
    "rule id should be unchanged after update",
    updated.id,
    beforeRuleId,
  );
  TestValidator.equals(
    "rule still belongs to the same community",
    updated.community_platform_community_id,
    community.id,
  );
  TestValidator.equals(
    "order_index should reflect the new value",
    updated.order_index,
    newOrderIndex,
  );
  TestValidator.equals(
    "text should reflect the new value",
    updated.text,
    newText,
  );
  TestValidator.notEquals(
    "updated_at should be changed after update",
    updated.updated_at,
    beforeUpdatedAt,
  );

  // Sanity: the returned association should match pre-update association too
  TestValidator.equals(
    "association preserved vs. pre-update entity",
    updated.community_platform_community_id,
    beforeCommunityId,
  );
}
