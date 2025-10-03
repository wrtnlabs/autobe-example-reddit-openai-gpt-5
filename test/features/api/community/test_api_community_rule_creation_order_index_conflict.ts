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
 * Enforce uniqueness of rule order per community.
 *
 * This test verifies that attempting to create two rules with the same order
 * index under the same community results in a business conflict.
 *
 * Steps:
 *
 * 1. Join as a registered member (User A) to obtain authentication.
 * 2. Create a community with a valid, unique name and category.
 * 3. Create the first rule with order=1 successfully.
 * 4. Attempt to create a second rule with the same order=1 and expect an error.
 * 5. Create another rule with a different order=2 to confirm only duplicates
 *    conflict.
 */
export async function test_api_community_rule_creation_order_index_conflict(
  connection: api.IConnection,
) {
  // Helper type for the community name path parameter (tagged string)
  type CommunityNameTagged = string &
    tags.MinLength<3> &
    tags.MaxLength<30> &
    tags.Pattern<"^[A-Za-z0-9](?:[A-Za-z0-9_-]{1,28}[A-Za-z0-9])?$">;

  // 1) Join as registered member (User A)
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const username: string = `user_${RandomGenerator.alphaNumeric(8)}`;
  const authorized: ICommunityPlatformRegisteredMember.IAuthorized =
    await api.functional.auth.registeredMember.join(connection, {
      body: {
        email,
        username,
        password: `P@ss-${RandomGenerator.alphaNumeric(10)}`,
        displayName: RandomGenerator.name(1),
      } satisfies ICommunityPlatformRegisteredMember.IJoin,
    });
  typia.assert(authorized);

  // 2) Create a community
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
  const category: IECommunityCategory = RandomGenerator.pick(categories);

  // Construct a valid community name (prefix + alphanum),
  // starts with alpha and ends with alphanum, length >= 3
  const rawCommunityName: string = `e2e-${RandomGenerator.alphaNumeric(8)}`;
  const communityNameTagged: CommunityNameTagged =
    typia.assert<CommunityNameTagged>(rawCommunityName);

  const community: ICommunityPlatformCommunity =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      {
        body: {
          name: communityNameTagged,
          category,
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);
  TestValidator.equals(
    "created community name equals input",
    community.name,
    rawCommunityName,
  );

  // 3) Create first rule with order=1
  const rule1Body = {
    order: 1,
    text: RandomGenerator.paragraph({ sentences: 8 }),
  } satisfies ICommunityPlatformCommunityRule.ICreate;

  const rule1: ICommunityPlatformCommunityRule =
    await api.functional.communityPlatform.registeredMember.communities.rules.create(
      connection,
      {
        communityName: communityNameTagged,
        body: rule1Body,
      },
    );
  typia.assert(rule1);
  TestValidator.equals(
    "first rule orderIndex should be 1",
    rule1.orderIndex,
    1,
  );
  TestValidator.equals(
    "first rule text should match",
    rule1.text,
    rule1Body.text,
  );

  // 4) Attempt duplicate rule with same order=1 -> expect error
  await TestValidator.error(
    "duplicate rule creation with same order should fail",
    async () => {
      await api.functional.communityPlatform.registeredMember.communities.rules.create(
        connection,
        {
          communityName: communityNameTagged,
          body: {
            order: 1,
            text: RandomGenerator.paragraph({ sentences: 6 }),
          } satisfies ICommunityPlatformCommunityRule.ICreate,
        },
      );
    },
  );

  // 5) Non-duplicate order=2 should succeed
  const rule2: ICommunityPlatformCommunityRule =
    await api.functional.communityPlatform.registeredMember.communities.rules.create(
      connection,
      {
        communityName: communityNameTagged,
        body: {
          order: 2,
          text: RandomGenerator.paragraph({ sentences: 7 }),
        } satisfies ICommunityPlatformCommunityRule.ICreate,
      },
    );
  typia.assert(rule2);
  TestValidator.equals(
    "second rule orderIndex should be 2",
    rule2.orderIndex,
    2,
  );
}
