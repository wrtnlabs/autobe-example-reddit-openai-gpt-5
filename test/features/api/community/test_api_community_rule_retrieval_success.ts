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

export async function test_api_community_rule_retrieval_success(
  connection: api.IConnection,
) {
  /**
   * Validate retrieval of a specific community rule by ID within its community.
   *
   * Steps:
   *
   * 1. Join as a registered member for authentication.
   * 2. Create a community with a unique, policy-compliant name.
   * 3. Create a rule under the community and capture its id.
   * 4. Retrieve the rule via GET using communityName and ruleId.
   * 5. Assert returned rule matches creation inputs (id, orderIndex, text).
   */

  // 1) Join as registered member (SDK will manage authorization headers)
  const auth = await api.functional.auth.registeredMember.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      username: `user-${RandomGenerator.alphabets(8)}`,
      password: `pw-${RandomGenerator.alphaNumeric(12)}`,
      displayName: RandomGenerator.name(1),
      client: {
        userAgent: `e2e/${RandomGenerator.alphaNumeric(6)}`,
      },
    } satisfies ICommunityPlatformRegisteredMember.IJoin,
  });
  typia.assert(auth);

  // 2) Create a community (name must start/end alphanumeric; length 3–30)
  const communityName: string &
    tags.MinLength<3> &
    tags.MaxLength<30> &
    tags.Pattern<"^[A-Za-z0-9](?:[A-Za-z0-9_-]{1,28}[A-Za-z0-9])?$"> =
    `c${RandomGenerator.alphaNumeric(10)}` as string &
      tags.MinLength<3> &
      tags.MaxLength<30> &
      tags.Pattern<"^[A-Za-z0-9](?:[A-Za-z0-9_-]{1,28}[A-Za-z0-9])?$">;

  const createCommunityBody = {
    name: communityName,
    category: typia.random<IECommunityCategory>(),
    description: RandomGenerator.paragraph({
      sentences: 6,
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
    "created community name matches request",
    community.name,
    communityName,
  );

  // 3) Create a rule under the community
  const ruleCreateBody = {
    order: 1,
    text: RandomGenerator.paragraph({ sentences: 8, wordMin: 3, wordMax: 6 }),
  } satisfies ICommunityPlatformCommunityRule.ICreate;

  const createdRule =
    await api.functional.communityPlatform.registeredMember.communities.rules.create(
      connection,
      {
        communityName,
        body: ruleCreateBody,
      },
    );
  typia.assert(createdRule);

  // 4) Retrieve the rule by ID under the same community
  const retrieved = await api.functional.communityPlatform.communities.rules.at(
    connection,
    {
      communityName,
      ruleId: createdRule.id,
    },
  );
  typia.assert(retrieved);

  // 5) Validate identity and field equality
  TestValidator.equals(
    "retrieved rule id equals created rule id",
    retrieved.id,
    createdRule.id,
  );
  TestValidator.equals(
    "retrieved rule orderIndex equals requested order",
    retrieved.orderIndex,
    ruleCreateBody.order,
  );
  TestValidator.equals(
    "retrieved rule text equals requested text",
    retrieved.text,
    ruleCreateBody.text,
  );
}
