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
 * Verify community owner can update a rule's text and order.
 *
 * Steps:
 *
 * 1. Join as registered member (User A) → Authorization auto-applied by SDK.
 * 2. Create a community owned by User A with valid name & category.
 * 3. Create a rule (order=1, text="Be respectful").
 * 4. Update rule via PUT: text → "Be kind and respectful", order → 2.
 * 5. Validate updated fields, stable id, and updatedAt > createdAt.
 */
export async function test_api_community_rule_update_text_and_order_by_owner(
  connection: api.IConnection,
) {
  // 1) Authenticate as registered member (join)
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    username: RandomGenerator.name(1),
    password: `P@ssw0rd_${RandomGenerator.alphaNumeric(8)}`,
  } satisfies ICommunityPlatformRegisteredMember.IJoin;
  const auth = await api.functional.auth.registeredMember.join(connection, {
    body: joinBody,
  });
  typia.assert(auth);

  // 2) Create a community (owner: current user)
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
  const communityName: string = `e2e_${RandomGenerator.alphaNumeric(8)}`; // matches ^[A-Za-z0-9](?:[A-Za-z0-9_-]{1,28}[A-Za-z0-9])?$
  const communityCreateBody = {
    name: communityName,
    category: RandomGenerator.pick(categories),
    description: RandomGenerator.paragraph({ sentences: 8 }),
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      { body: communityCreateBody },
    );
  typia.assert(community);
  TestValidator.equals(
    "community name should equal requested name",
    community.name,
    communityName,
  );

  // 3) Create initial rule
  const initialRuleBody = {
    order: 1,
    text: "Be respectful",
  } satisfies ICommunityPlatformCommunityRule.ICreate;
  const createdRule =
    await api.functional.communityPlatform.registeredMember.communities.rules.create(
      connection,
      {
        communityName,
        body: initialRuleBody,
      },
    );
  typia.assert(createdRule);
  TestValidator.equals(
    "created rule orderIndex is 1",
    createdRule.orderIndex,
    1,
  );
  TestValidator.equals(
    "created rule text matches",
    createdRule.text,
    initialRuleBody.text,
  );

  // 4) Update rule (text + order)
  const updatedText = "Be kind and respectful";
  const updateBody = {
    order: 2,
    text: updatedText,
  } satisfies ICommunityPlatformCommunityRule.IUpdate;
  const updatedRule =
    await api.functional.communityPlatform.registeredMember.communities.rules.update(
      connection,
      {
        communityName,
        ruleId: createdRule.id,
        body: updateBody,
      },
    );
  typia.assert(updatedRule);

  // 5) Validations
  TestValidator.equals(
    "rule id remains unchanged after update",
    updatedRule.id,
    createdRule.id,
  );
  TestValidator.equals("rule text updated", updatedRule.text, updatedText);
  TestValidator.equals(
    "rule orderIndex updated to 2",
    updatedRule.orderIndex,
    2,
  );
  const createdAtMs = Date.parse(createdRule.createdAt);
  const updatedAtMs = Date.parse(updatedRule.updatedAt);
  TestValidator.predicate(
    "updatedAt must be greater than createdAt",
    updatedAtMs > createdAtMs,
  );
}
