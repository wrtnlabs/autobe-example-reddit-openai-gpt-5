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

export async function test_api_community_rule_update_mismatched_parent_returns_not_found(
  connection: api.IConnection,
) {
  // 1) Authenticate as Owner A (communityMember)
  const owner = await api.functional.auth.communityMember.join(connection, {
    body: {
      username: `member_${RandomGenerator.alphaNumeric(12)}`,
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12), // >= 8 chars by generator
    } satisfies ICommunityPlatformCommunityMember.ICreate,
  });
  typia.assert(owner);

  // 2) Discover/select active category (ensure at least one exists)
  const categoriesPage =
    await api.functional.communityPlatform.categories.index(connection, {
      body: {
        active: true,
      } satisfies ICommunityPlatformCategory.IRequest,
    });
  typia.assert(categoriesPage);
  await TestValidator.predicate(
    "at least one active category exists",
    categoriesPage.data.length > 0,
  );
  const pickedCategory = RandomGenerator.pick(categoriesPage.data);
  const categoryId = pickedCategory.id;

  // 3) Create Community A and Community B
  // Name must start with a letter and be 3–32 chars per schema; prefix with 'c'
  const createCommunityABody = {
    name: `c${RandomGenerator.alphaNumeric(7)}`,
    community_platform_category_id: categoryId,
    description: RandomGenerator.paragraph({ sentences: 6 }),
  } satisfies ICommunityPlatformCommunity.ICreate;
  const communityA =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      { body: createCommunityABody },
    );
  typia.assert(communityA);

  const createCommunityBBody = {
    name: `c${RandomGenerator.alphaNumeric(7)}`,
    community_platform_category_id: categoryId,
    description: RandomGenerator.paragraph({ sentences: 6 }),
  } satisfies ICommunityPlatformCommunity.ICreate;
  const communityB =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      { body: createCommunityBBody },
    );
  typia.assert(communityB);

  TestValidator.notEquals(
    "two communities must have different ids",
    communityA.id,
    communityB.id,
  );

  // 4) Create Rule R under Community A (ensure text length <= 200)
  const rawRuleText = RandomGenerator.paragraph({
    sentences: 10,
    wordMin: 3,
    wordMax: 7,
  });
  const boundedRuleText =
    rawRuleText.length > 180 ? rawRuleText.slice(0, 180) : rawRuleText; // keep within 200 chars
  const createRuleBody = {
    order_index: 0,
    text: boundedRuleText.length === 0 ? "rule" : boundedRuleText,
  } satisfies ICommunityPlatformCommunityRule.ICreate;
  const ruleA =
    await api.functional.communityPlatform.communityMember.communities.rules.create(
      connection,
      {
        communityId: communityA.id,
        body: createRuleBody,
      },
    );
  typia.assert(ruleA);
  TestValidator.equals(
    "rule must belong to community A",
    ruleA.community_platform_community_id,
    communityA.id,
  );

  // 5) Attempt mismatched parent update: communityId = B, ruleId = R (from A)
  const updateBody = {
    text: "updated via mismatched parent",
  } satisfies ICommunityPlatformCommunityRule.IUpdate;

  await TestValidator.error(
    "mismatched parent cannot update rule",
    async () => {
      await api.functional.communityPlatform.communityMember.communities.rules.update(
        connection,
        {
          communityId: communityB.id,
          ruleId: ruleA.id,
          body: updateBody,
        },
      );
    },
  );
}
