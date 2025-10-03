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
 * Validate community rule creation by the community owner.
 *
 * Purpose
 *
 * - Ensure that an authenticated registered member who has created a community
 *   can add a rule to that community successfully using the dedicated rules
 *   API.
 *
 * Flow
 *
 * 1. Join as a registered member (User A) to establish an authenticated session.
 * 2. Create a community owned by User A with a valid name and category.
 * 3. Create a rule under that community with order=1 and short text.
 * 4. Validate business outcomes:
 *
 *    - Community.name matches requested name.
 *    - Returned rule reflects requested order/text values.
 *
 * Notes
 *
 * - All response schemas are validated only via typia.assert().
 * - No failure-path or type error tests are included.
 */
export async function test_api_community_rule_creation_by_owner(
  connection: api.IConnection,
) {
  // 1) Join as registered member (User A)
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    username: RandomGenerator.name(1),
    password: RandomGenerator.alphaNumeric(12),
    displayName: RandomGenerator.name(1),
  } satisfies ICommunityPlatformRegisteredMember.IJoin;
  const authorized: ICommunityPlatformRegisteredMember.IAuthorized =
    await api.functional.auth.registeredMember.join(connection, {
      body: joinBody,
    });
  typia.assert(authorized);

  // 2) Create a community owned by User A
  const communityName = typia.random<
    string &
      tags.MinLength<3> &
      tags.MaxLength<30> &
      tags.Pattern<"^[A-Za-z0-9](?:[A-Za-z0-9_-]{1,28}[A-Za-z0-9])?$">
  >();
  const createCommunityBody = {
    name: communityName,
    category: "Science" as IECommunityCategory,
    description: RandomGenerator.paragraph({
      sentences: 8,
      wordMin: 3,
      wordMax: 8,
    }),
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community: ICommunityPlatformCommunity =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      { body: createCommunityBody },
    );
  typia.assert(community);
  TestValidator.equals(
    "community name should equal input name",
    community.name,
    communityName,
  );

  // 3) Create a rule under the created community
  const ruleRequest = {
    order: 1,
    text: "Be respectful",
  } satisfies ICommunityPlatformCommunityRule.ICreate;
  const rule: ICommunityPlatformCommunityRule =
    await api.functional.communityPlatform.registeredMember.communities.rules.create(
      connection,
      {
        communityName,
        body: ruleRequest,
      },
    );
  typia.assert(rule);

  // 4) Business validations for created rule
  TestValidator.equals(
    "rule text should persist as requested",
    rule.text,
    ruleRequest.text,
  );
  TestValidator.equals(
    "rule orderIndex should match requested order",
    rule.orderIndex,
    ruleRequest.order,
  );
}
