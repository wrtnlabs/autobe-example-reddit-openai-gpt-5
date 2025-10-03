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
 * Ensure a non-owner cannot update a community rule.
 *
 * Steps:
 *
 * 1. Join as User A (registered member) and create a community with a valid
 *    name/category.
 * 2. Under User A, create a rule and capture its id.
 * 3. Join as User B (another registered member) to switch auth context.
 * 4. Attempt to update the rule as User B and expect the operation to fail.
 *
 * Notes:
 *
 * - We assert only that an error is thrown on the forbidden attempt, per E2E
 *   guardrails (no explicit status/message assertion).
 * - All successful responses are validated via typia.assert().
 */
export async function test_api_community_rule_update_forbidden_non_owner(
  connection: api.IConnection,
) {
  // 1) Join as User A (owner)
  const joinBodyA = {
    email: typia.random<string & tags.Format<"email">>(),
    username: `user_${RandomGenerator.alphaNumeric(12)}`,
    password: "P@ssw0rd123",
    displayName: RandomGenerator.name(1),
  } satisfies ICommunityPlatformRegisteredMember.IJoin;
  const userA = await api.functional.auth.registeredMember.join(connection, {
    body: joinBodyA,
  });
  typia.assert(userA);

  // 2) Create a community under User A
  const communityName = `c${RandomGenerator.alphaNumeric(11)}`; // 12 chars, starts with letter, ends alnum
  const communityBody = {
    name: communityName,
    category: typia.random<IECommunityCategory>(),
    description: `About ${communityName}`,
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      { body: communityBody },
    );
  typia.assert(community);

  // Create a rule under the community
  const ruleCreateBody = {
    order: 1,
    text: `Rule-${RandomGenerator.alphabets(10)}`,
  } satisfies ICommunityPlatformCommunityRule.ICreate;
  const rule =
    await api.functional.communityPlatform.registeredMember.communities.rules.create(
      connection,
      {
        communityName: community.name,
        body: ruleCreateBody,
      },
    );
  typia.assert(rule);

  // 3) Join as User B to switch authentication context
  const joinBodyB = {
    email: typia.random<string & tags.Format<"email">>(),
    username: `user_${RandomGenerator.alphaNumeric(12)}`,
    password: "P@ssw0rd123",
    displayName: RandomGenerator.name(1),
  } satisfies ICommunityPlatformRegisteredMember.IJoin;
  const userB = await api.functional.auth.registeredMember.join(connection, {
    body: joinBodyB,
  });
  typia.assert(userB);

  // 4) Attempt to update the rule as non-owner (User B) and expect rejection
  const forbiddenUpdateBody = {
    text: "non-owner update",
    order: 2,
  } satisfies ICommunityPlatformCommunityRule.IUpdate;
  await TestValidator.error(
    "non-owner cannot update community rule",
    async () => {
      await api.functional.communityPlatform.registeredMember.communities.rules.update(
        connection,
        {
          communityName: community.name,
          ruleId: rule.id,
          body: forbiddenUpdateBody,
        },
      );
    },
  );
}
