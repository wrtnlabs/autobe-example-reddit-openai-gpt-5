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
 * Ensure rule lookup honors community scope.
 *
 * This test verifies that a community rule can only be read from within the
 * community it belongs to. It follows this flow:
 *
 * 1. Register a member (authenticated context for creation endpoints)
 * 2. Create two distinct communities (C1 and C2) with valid names and categories
 * 3. Create a rule under C1 and capture its ruleId
 * 4. Sanity: fetch the rule with the correct scope (C1 + ruleId) and validate
 * 5. Negative: try fetching the same rule using C2 + ruleId and expect an error
 *
 * Notes:
 *
 * - No HTTP status code assertions (policy). Validate error existence only.
 * - All responses are validated via typia.assert().
 * - Request bodies use `satisfies` to ensure DTO correctness.
 */
export async function test_api_community_rule_not_found_wrong_community_scope(
  connection: api.IConnection,
) {
  // 1) Register a member (auth for create endpoints)
  const joinOutput = await api.functional.auth.registeredMember.join(
    connection,
    {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        username: RandomGenerator.name(1),
        password: "P@ssw0rd!123",
        displayName: null,
      } satisfies ICommunityPlatformRegisteredMember.IJoin,
    },
  );
  typia.assert(joinOutput);

  // Small helper: valid community name generator (starts with letter, 3-30 total)
  const makeCommunityName = (prefix: string = "c"): string => {
    const middle = RandomGenerator.alphabets(6); // ensures letters only
    return `${prefix}${middle}`; // e.g., "cxxxxxx" (7 chars, valid by regex)
  };

  // Allowed categories
  const categories = [
    "Tech & Programming",
    "Science",
    "Movies & TV",
    "Games",
    "Sports",
    "Lifestyle & Wellness",
    "Study & Education",
    "Art & Design",
    "Business & Finance",
    "News & Current Affairs",
  ] as const;

  // 2) Create two distinct communities
  const nameC1: string = makeCommunityName("c");
  const nameC2: string = makeCommunityName("c");

  const community1 =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      {
        body: {
          name: nameC1,
          category: RandomGenerator.pick(categories) as IECommunityCategory,
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community1);
  TestValidator.equals(
    "community1 name matches input",
    community1.name,
    nameC1,
  );

  const community2 =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      {
        body: {
          name: nameC2,
          category: RandomGenerator.pick(categories) as IECommunityCategory,
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community2);
  TestValidator.equals(
    "community2 name matches input",
    community2.name,
    nameC2,
  );

  // 3) Create a rule under C1
  const createdRule =
    await api.functional.communityPlatform.registeredMember.communities.rules.create(
      connection,
      {
        communityName: nameC1,
        body: {
          order: 1,
          // Keep rule text within 100 characters
          text: RandomGenerator.paragraph({ sentences: 6 }).slice(0, 90),
        } satisfies ICommunityPlatformCommunityRule.ICreate,
      },
    );
  typia.assert(createdRule);

  // 4) Sanity: fetch with correct scope (C1)
  const fetchedInC1 =
    await api.functional.communityPlatform.communities.rules.at(connection, {
      communityName: nameC1,
      ruleId: createdRule.id,
    });
  typia.assert(fetchedInC1);
  TestValidator.equals(
    "rule fetched in correct community matches created rule",
    fetchedInC1.id,
    createdRule.id,
  );

  // 5) Negative: attempt fetch with wrong scope (C2) -> expect error (not-found)
  await TestValidator.error(
    "rule must not be retrievable from a different community",
    async () => {
      await api.functional.communityPlatform.communities.rules.at(connection, {
        communityName: nameC2,
        ruleId: createdRule.id,
      });
    },
  );
}
