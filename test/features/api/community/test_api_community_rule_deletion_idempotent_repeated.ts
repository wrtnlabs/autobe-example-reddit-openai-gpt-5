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
 * Idempotent deletion of a community rule: deleting the same rule twice
 * succeeds without errors.
 *
 * Business flow
 *
 * 1. Join as a registered member to obtain an authenticated session.
 * 2. Create a uniquely named community (name matches regex and length constraints)
 *    with a valid category.
 * 3. Create a rule under the community and capture its ruleId.
 * 4. Delete the rule once (should succeed; no response body).
 * 5. Delete the same rule again (should be idempotent; also succeeds without
 *    error).
 *
 * Validations
 *
 * - Type assertions on authentication, community creation, and rule creation
 *   results via typia.assert().
 * - Confirm the created community's name equals the requested name.
 * - Idempotency confirmed by absence of errors on the second deletion.
 */
export async function test_api_community_rule_deletion_idempotent_repeated(
  connection: api.IConnection,
) {
  // 1) Authenticate (join) as a registered member
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    username: RandomGenerator.name(1),
    password: RandomGenerator.alphaNumeric(12),
    displayName: RandomGenerator.name(),
  } satisfies ICommunityPlatformRegisteredMember.IJoin;
  const authorized = await api.functional.auth.registeredMember.join(
    connection,
    {
      body: joinBody,
    },
  );
  typia.assert(authorized);

  // 2) Create a community with a valid unique name and a valid category
  const communityName = `e2e-${RandomGenerator.alphaNumeric(8)}`;
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
  const category = RandomGenerator.pick(categories);

  const createCommunityBody = {
    name: communityName,
    category,
    description: RandomGenerator.paragraph({
      sentences: 8,
      wordMin: 3,
      wordMax: 8,
    }),
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      { body: createCommunityBody },
    );
  typia.assert(community);
  TestValidator.equals(
    "created community preserves requested name",
    community.name,
    communityName,
  );

  // 3) Create a rule under the community and capture its id
  const createRuleBody = {
    order: 1,
    text: RandomGenerator.paragraph({ sentences: 6, wordMin: 3, wordMax: 8 }),
  } satisfies ICommunityPlatformCommunityRule.ICreate;
  const rule =
    await api.functional.communityPlatform.registeredMember.communities.rules.create(
      connection,
      { communityName, body: createRuleBody },
    );
  typia.assert(rule);
  const ruleId = rule.id; // uuid for deletion

  // 4) First deletion should succeed (no exception expected)
  await api.functional.communityPlatform.registeredMember.communities.rules.erase(
    connection,
    { communityName, ruleId },
  );

  // 5) Second deletion should be idempotent and also succeed without errors
  await api.functional.communityPlatform.registeredMember.communities.rules.erase(
    connection,
    { communityName, ruleId },
  );

  TestValidator.predicate(
    "second deletion completed without error (idempotent behavior)",
    true,
  );
}
