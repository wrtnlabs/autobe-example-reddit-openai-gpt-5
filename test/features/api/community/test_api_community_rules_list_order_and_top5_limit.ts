import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IClientContext } from "@ORGANIZATION/PROJECT-api/lib/structures/IClientContext";
import type { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";
import type { ICommunityPlatformCommunityRule } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityRule";
import type { ICommunityPlatformCommunityRuleArray } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityRuleArray";
import type { ICommunityPlatformRegisteredMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRegisteredMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";
import type { IECommunityCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityCategory";
import type { IECommunityPlatformCommunityCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformCommunityCategory";
import type { IECommunityPlatformCommunityRuleSortBy } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformCommunityRuleSortBy";
import type { IESortOrder } from "@ORGANIZATION/PROJECT-api/lib/structures/IESortOrder";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformCommunityRule } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformCommunityRule";

/**
 * Verify community rules listing default ordering and Top 5 limit behavior.
 *
 * Flow:
 *
 * 1. Join as a registered member to obtain an authenticated session.
 * 2. Create a new community with a valid, unique name and category.
 * 3. Create six rules under the community with distinct order indices 1..6.
 * 4. List rules with limit=5 and validate:
 *
 *    - Exactly five items are returned
 *    - Items are ordered by orderIndex ascending
 *    - Returned IDs match the first five created rules (orders 1..5)
 *    - The 6th created rule is excluded from the Top 5 listing
 * 5. List rules again with a large limit and validate all six are returned in
 *    ascending order.
 */
export async function test_api_community_rules_list_order_and_top5_limit(
  connection: api.IConnection,
) {
  // 1) Register a new member (authentication handled by SDK)
  const joinOutput = await api.functional.auth.registeredMember.join(
    connection,
    {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        username: RandomGenerator.name(1),
        password: `Pw_${RandomGenerator.alphaNumeric(12)}`,
      } satisfies ICommunityPlatformRegisteredMember.IJoin,
    },
  );
  typia.assert(joinOutput);

  // 2) Create a new community
  const communityName: string = `e2e-${RandomGenerator.alphaNumeric(10)}`; // matches required pattern and length
  const community =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      {
        body: {
          name: communityName,
          category: "Science",
          description: RandomGenerator.paragraph({ sentences: 8 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);

  // 3) Create six rules with distinct order indices (1..6)
  const createdRules: ICommunityPlatformCommunityRule[] = [];
  for (let order = 1; order <= 6; order++) {
    const rule =
      await api.functional.communityPlatform.registeredMember.communities.rules.create(
        connection,
        {
          communityName: community.name,
          body: {
            order,
            // keep short (<= 100 chars) by limiting words
            text: RandomGenerator.paragraph({
              sentences: 6,
              wordMin: 3,
              wordMax: 6,
            }),
          } satisfies ICommunityPlatformCommunityRule.ICreate,
        },
      );
    typia.assert(rule);
    createdRules.push(rule);
  }

  // Helper: expected first five by orderIndex asc
  const expectedAsc = [...createdRules].sort(
    (a, b) => a.orderIndex - b.orderIndex,
  );
  const expectedTop5 = expectedAsc.slice(0, 5);
  const excluded6th = expectedAsc[5];

  // 4) List rules with limit=5 (Top 5)
  const pageTop5 =
    await api.functional.communityPlatform.communities.rules.index(connection, {
      communityName: community.name,
      body: {
        limit: 5,
      } satisfies ICommunityPlatformCommunityRule.IRequest,
    });
  typia.assert(pageTop5);

  // Validations for Top 5 listing
  TestValidator.equals(
    "top5: returns exactly 5 items",
    pageTop5.data.length,
    5,
  );
  TestValidator.predicate("top5: orderIndex is ascending", () =>
    pageTop5.data.every((r, i, arr) =>
      i === 0 ? true : arr[i - 1].orderIndex <= r.orderIndex,
    ),
  );
  const actualTop5Ids = pageTop5.data.map((r) => r.id);
  const expectedTop5Ids = expectedTop5.map((r) => r.id);
  TestValidator.equals(
    "top5: ids match first five created rules",
    actualTop5Ids,
    expectedTop5Ids,
  );
  TestValidator.predicate(
    "top5: 6th rule (by order) is excluded",
    () => !actualTop5Ids.includes(excluded6th.id),
  );

  // 5) List rules with large limit to fetch all
  const pageAll =
    await api.functional.communityPlatform.communities.rules.index(connection, {
      communityName: community.name,
      body: {
        limit: 100,
      } satisfies ICommunityPlatformCommunityRule.IRequest,
    });
  typia.assert(pageAll);

  // Validate all six created rules are present and in ascending order
  TestValidator.equals("all: returns all 6 items", pageAll.data.length, 6);
  TestValidator.predicate("all: orderIndex is ascending", () =>
    pageAll.data.every((r, i, arr) =>
      i === 0 ? true : arr[i - 1].orderIndex <= r.orderIndex,
    ),
  );
  const actualAllIds = pageAll.data.map((r) => r.id);
  const expectedAllIds = expectedAsc.map((r) => r.id);
  TestValidator.equals(
    "all: ids match all created rules in order",
    actualAllIds,
    expectedAllIds,
  );
}
