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
 * Ensure soft-deleted community rules are not retrievable.
 *
 * Steps:
 *
 * 1. Join as a registered member (authentication token auto-managed by SDK)
 * 2. Create a community with a unique, policy-compliant name
 * 3. Create one rule under the community and capture the ruleId
 * 4. Sanity check: GET the rule before deletion and verify id matches
 * 5. Soft-delete the rule via DELETE
 * 6. Attempt to GET the same rule again and expect an error (not-found)
 */
export async function test_api_community_rule_not_found_after_deletion(
  connection: api.IConnection,
) {
  // 1) Authenticate (Registered Member Join)
  const authorized = await api.functional.auth.registeredMember.join(
    connection,
    {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        username: `user_${RandomGenerator.alphaNumeric(12)}`,
        password: `P@ssw0rd-${RandomGenerator.alphaNumeric(12)}`,
      } satisfies ICommunityPlatformRegisteredMember.IJoin,
    },
  );
  typia.assert(authorized);

  // 2) Create a community with a valid, unique name
  const communityName = `rule-del-${RandomGenerator.alphaNumeric(10)}`; // matches ^[A-Za-z0-9](?:[A-Za-z0-9_-]{1,28}[A-Za-z0-9])?$ by starting with alpha and ending alphanumeric
  const community =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      {
        body: {
          name: communityName,
          category: "Science",
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);

  // 3) Create a rule under the community
  const createdRule =
    await api.functional.communityPlatform.registeredMember.communities.rules.create(
      connection,
      {
        communityName: community.name,
        body: {
          order: 1,
          text: RandomGenerator.paragraph({
            sentences: 6,
            wordMin: 3,
            wordMax: 7,
          }),
        } satisfies ICommunityPlatformCommunityRule.ICreate,
      },
    );
  typia.assert(createdRule);

  // 4) Sanity read pre-deletion
  const fetchedBeforeDelete =
    await api.functional.communityPlatform.communities.rules.at(connection, {
      communityName: community.name,
      ruleId: createdRule.id,
    });
  typia.assert(fetchedBeforeDelete);
  TestValidator.equals(
    "fetched rule id matches created id",
    fetchedBeforeDelete.id,
    createdRule.id,
  );

  // 5) Soft-delete the rule
  await api.functional.communityPlatform.registeredMember.communities.rules.erase(
    connection,
    {
      communityName: community.name,
      ruleId: createdRule.id,
    },
  );

  // 6) Verify not-found (error) after deletion
  await TestValidator.error("deleted rule cannot be fetched", async () => {
    await api.functional.communityPlatform.communities.rules.at(connection, {
      communityName: community.name,
      ruleId: createdRule.id,
    });
  });
}
