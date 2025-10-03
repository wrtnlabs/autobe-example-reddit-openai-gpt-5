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
 * Verify that a non-owner cannot delete another user's community rule.
 *
 * Steps:
 *
 * 1. Create two independent authenticated sessions using cloned connections:
 *
 *    - User A (owner)
 *    - User B (non-owner)
 * 2. User A creates a community with a valid name and category.
 * 3. User A creates a rule under the community; capture ruleId.
 * 4. User B attempts to delete the rule via DELETE; expect an error.
 * 5. User A deletes the same rule successfully to confirm it still existed after
 *    the failed attempt.
 *
 * Notes:
 *
 * - Uses two cloned api.IConnection objects to preserve separate auth headers.
 * - Does not assert specific HTTP status codes; only checks that an error occurs.
 * - Validates non-void responses with typia.assert().
 */
export async function test_api_community_rule_deletion_forbidden_non_owner(
  connection: api.IConnection,
) {
  // Prepare two independent connections for two different users
  const connA: api.IConnection = { ...connection, headers: {} };
  const connB: api.IConnection = { ...connection, headers: {} };

  // 1) User A joins (becomes owner context)
  const aJoin = await api.functional.auth.registeredMember.join(connA, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      username: RandomGenerator.alphaNumeric(12),
      password: RandomGenerator.alphaNumeric(16),
      displayName: RandomGenerator.name(2),
      client: { userAgent: "e2e-community-rule-tests" },
    } satisfies ICommunityPlatformRegisteredMember.IJoin,
  });
  typia.assert(aJoin);

  // 2) User A creates a community
  const communityName = typia.random<
    string &
      tags.MinLength<3> &
      tags.MaxLength<30> &
      tags.Pattern<"^[A-Za-z0-9](?:[A-Za-z0-9_-]{1,28}[A-Za-z0-9])?$">
  >();
  const category = typia.random<IECommunityCategory>();
  const community =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connA,
      {
        body: {
          name: communityName,
          category,
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);
  TestValidator.equals(
    "community name matches input",
    community.name,
    communityName,
  );

  // 3) User A creates a community rule
  const rule =
    await api.functional.communityPlatform.registeredMember.communities.rules.create(
      connA,
      {
        communityName: community.name,
        body: {
          order: 1,
          text: typia.random<
            string & tags.MinLength<1> & tags.MaxLength<100>
          >(),
        } satisfies ICommunityPlatformCommunityRule.ICreate,
      },
    );
  typia.assert(rule);
  TestValidator.equals(
    "created rule orderIndex matches requested order",
    rule.orderIndex,
    1,
  );

  // 4) User B joins (non-owner context)
  const bJoin = await api.functional.auth.registeredMember.join(connB, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      username: RandomGenerator.alphaNumeric(12),
      password: RandomGenerator.alphaNumeric(16),
      displayName: RandomGenerator.name(2),
      client: { userAgent: "e2e-community-rule-tests" },
    } satisfies ICommunityPlatformRegisteredMember.IJoin,
  });
  typia.assert(bJoin);

  // 5) User B attempts to delete the rule -> expect error (no status code assertion)
  await TestValidator.error(
    "non-owner cannot delete community rule",
    async () => {
      await api.functional.communityPlatform.registeredMember.communities.rules.erase(
        connB,
        {
          communityName: community.name,
          ruleId: rule.id,
        },
      );
    },
  );

  // 6) Owner (User A) deletes the rule successfully (confirms persistence after failed attempt)
  await api.functional.communityPlatform.registeredMember.communities.rules.erase(
    connA,
    {
      communityName: community.name,
      ruleId: rule.id,
    },
  );
}
