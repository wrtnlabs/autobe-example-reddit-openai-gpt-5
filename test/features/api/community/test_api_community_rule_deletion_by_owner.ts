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
 * Verify that the community owner can delete a rule (soft-delete) successfully.
 *
 * Steps
 *
 * 1. Join as a registered member (User A) to obtain an authenticated session
 * 2. Create a community owned by User A
 * 3. Create a rule under that community and validate the response
 * 4. Delete the created rule and verify the operation returns void (undefined)
 *
 * Notes
 *
 * - We do not attempt post-deletion reads because rule read/list endpoints are
 *   not provided in the available SDK functions. Successful void response and
 *   absence of errors validate deletion behavior at API-level.
 */
export async function test_api_community_rule_deletion_by_owner(
  connection: api.IConnection,
) {
  // 1) Join as registered member (User A)
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    username: RandomGenerator.name(1).replace(/\s+/g, ""),
    password: RandomGenerator.alphaNumeric(12),
    displayName: RandomGenerator.name(2),
  } satisfies ICommunityPlatformRegisteredMember.IJoin;
  const me: ICommunityPlatformRegisteredMember.IAuthorized =
    await api.functional.auth.registeredMember.join(connection, {
      body: joinBody,
    });
  typia.assert(me);

  // 2) Create a community owned by User A
  const communityName = "c" + RandomGenerator.alphaNumeric(6) + "x"; // conforms to pattern and length

  const createCommunityBody = {
    name: communityName,
    category: typia.random<IECommunityCategory>(),
  } satisfies ICommunityPlatformCommunity.ICreate;

  const community: ICommunityPlatformCommunity =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      { body: createCommunityBody },
    );
  typia.assert(community);
  TestValidator.equals(
    "created community name should equal input name",
    community.name,
    communityName,
  );

  // 3) Create a rule beneath the community
  const ruleCreateBody = {
    order: 1, // int32 >= 1
    text: `Be-kind-${RandomGenerator.alphabets(10)}`,
  } satisfies ICommunityPlatformCommunityRule.ICreate;

  const rule: ICommunityPlatformCommunityRule =
    await api.functional.communityPlatform.registeredMember.communities.rules.create(
      connection,
      {
        communityName: communityName,
        body: ruleCreateBody,
      },
    );
  typia.assert(rule);
  TestValidator.equals(
    "rule orderIndex should reflect input order",
    rule.orderIndex,
    ruleCreateBody.order,
  );
  TestValidator.equals(
    "rule text should reflect input text",
    rule.text,
    ruleCreateBody.text,
  );

  // 4) Delete the rule (soft-delete). Expect void/undefined result (HTTP 204 in REST semantics)
  const nothing =
    await api.functional.communityPlatform.registeredMember.communities.rules.erase(
      connection,
      {
        communityName: communityName,
        ruleId: rule.id,
      },
    );
  TestValidator.equals("erase returns undefined (void)", nothing, undefined);
}
