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

/**
 * Validate conflict handling when updating a community rule to a duplicate
 * order.
 *
 * Steps
 *
 * 1. Join as a registered member (User A).
 * 2. Create a community owned by User A.
 * 3. Create two rules with distinct orders (1 and 2).
 * 4. Attempt to update the second rule's order to 1 (duplicate of the first).
 *
 *    - Expect an error to be thrown (conflict outcome) without asserting status
 *         codes.
 * 5. Perform a valid update of the second rule to order 3 to confirm normal
 *    behavior resumes.
 */
export async function test_api_community_rule_update_order_index_conflict(
  connection: api.IConnection,
) {
  // 1) Authenticate as registered member (User A)
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    username: RandomGenerator.name(1),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformRegisteredMember.IJoin;
  const me: ICommunityPlatformRegisteredMember.IAuthorized =
    await api.functional.auth.registeredMember.join(connection, {
      body: joinBody,
    });
  typia.assert(me);

  // Prepare a community name satisfying path param constraints up front
  const communityName = typia.random<
    string &
      tags.MinLength<3> &
      tags.MaxLength<30> &
      tags.Pattern<"^[A-Za-z0-9](?:[A-Za-z0-9_-]{1,28}[A-Za-z0-9])?$">
  >();

  // 2) Create the parent community
  const community =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      {
        body: {
          name: communityName,
          category: typia.random<IECommunityCategory>(),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);

  // 3) Seed initial rules with unique orders (1 and 2)
  const ruleText1 = RandomGenerator.paragraph({ sentences: 6 });
  const ruleText2 = RandomGenerator.paragraph({ sentences: 6 });

  const rule1 =
    await api.functional.communityPlatform.registeredMember.communities.rules.create(
      connection,
      {
        communityName,
        body: {
          order: 1,
          text: ruleText1,
        } satisfies ICommunityPlatformCommunityRule.ICreate,
      },
    );
  typia.assert(rule1);
  await TestValidator.predicate(
    "precondition: rule1 has orderIndex 1",
    async () => rule1.orderIndex === 1,
  );

  const rule2 =
    await api.functional.communityPlatform.registeredMember.communities.rules.create(
      connection,
      {
        communityName,
        body: {
          order: 2,
          text: ruleText2,
        } satisfies ICommunityPlatformCommunityRule.ICreate,
      },
    );
  typia.assert(rule2);
  await TestValidator.predicate(
    "precondition: rule2 has orderIndex 2 and differs from rule1",
    async () => rule2.orderIndex === 2 && rule2.orderIndex !== rule1.orderIndex,
  );

  // 4) Attempt duplicate order update: set rule2's order to rule1's order
  await TestValidator.error(
    "updating rule2 to a duplicate order should be rejected",
    async () => {
      await api.functional.communityPlatform.registeredMember.communities.rules.update(
        connection,
        {
          communityName,
          ruleId: rule2.id,
          body: {
            order: rule1.orderIndex,
          } satisfies ICommunityPlatformCommunityRule.IUpdate,
        },
      );
    },
  );

  // 5) Valid update after conflict: move rule2 to a non-conflicting order (e.g., 3)
  const updatedRule2 =
    await api.functional.communityPlatform.registeredMember.communities.rules.update(
      connection,
      {
        communityName,
        ruleId: rule2.id,
        body: {
          order: 3,
        } satisfies ICommunityPlatformCommunityRule.IUpdate,
      },
    );
  typia.assert(updatedRule2);
  TestValidator.equals(
    "updated rule id remains unchanged",
    updatedRule2.id,
    rule2.id,
  );
  await TestValidator.predicate(
    "non-conflicting update sets orderIndex to 3",
    async () => updatedRule2.orderIndex === 3,
  );
}
