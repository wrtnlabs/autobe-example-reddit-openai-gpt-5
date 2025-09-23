import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCategory";
import type { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformCommunityRule } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityRule";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";
import type { IECategorySortBy } from "@ORGANIZATION/PROJECT-api/lib/structures/IECategorySortBy";
import type { IESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IESortDirection";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformCategory";

/**
 * Ensure not-found outcome when requesting a ruleId under the wrong community.
 *
 * Steps:
 *
 * 1. Join as a community member (auth) to obtain an authenticated session
 * 2. Query active categories and pick one for community creation
 * 3. Create two communities: A and B (names respect required pattern)
 * 4. Create rule R under community B (order_index >= 0, text <= 200 chars)
 * 5. Read rule R from community B (positive control)
 * 6. Attempt to read rule R under community A and expect an error (not-found)
 */
export async function test_api_community_rule_wrong_community_not_found(
  connection: api.IConnection,
) {
  // 1) Authenticate by joining a community member
  const authorized = await api.functional.auth.communityMember.join(
    connection,
    {
      body: {
        username: `user_${RandomGenerator.alphaNumeric(10)}`,
        email: typia.random<string & tags.Format<"email">>(),
        password: `${RandomGenerator.alphaNumeric(12)}`,
      } satisfies ICommunityPlatformCommunityMember.ICreate,
    },
  );
  typia.assert(authorized);

  // 2) Pick an active category for community creation
  const categories = await api.functional.communityPlatform.categories.index(
    connection,
    {
      body: {
        active: true,
      } satisfies ICommunityPlatformCategory.IRequest,
    },
  );
  typia.assert(categories);
  TestValidator.predicate(
    "at least one active category must exist",
    categories.data.length > 0,
  );
  const categoryId = categories.data[0].id;

  // Community name generator: starts with a letter and uses [A-Za-z0-9_-], length within 3–32
  const makeCommunityName = (): string =>
    `c${RandomGenerator.alphaNumeric(10)}`;

  // 3) Create two communities: A and B
  const communityA =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      {
        body: {
          name: makeCommunityName(),
          community_platform_category_id: categoryId,
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(communityA);

  const communityB =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      {
        body: {
          name: makeCommunityName(),
          community_platform_category_id: categoryId,
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(communityB);

  // 4) Create rule R under community B
  const textRaw = RandomGenerator.paragraph({
    sentences: 8,
    wordMin: 3,
    wordMax: 8,
  });
  const ruleText = (textRaw.length > 0 ? textRaw : "rule").slice(0, 180); // ensure 1..200
  const ruleB =
    await api.functional.communityPlatform.communityMember.communities.rules.create(
      connection,
      {
        communityId: communityB.id,
        body: {
          order_index: 0,
          text: ruleText,
        } satisfies ICommunityPlatformCommunityRule.ICreate,
      },
    );
  typia.assert(ruleB);

  // 5) Positive control: fetch rule R under the correct community B
  const fetchedB = await api.functional.communityPlatform.communities.rules.at(
    connection,
    { communityId: communityB.id, ruleId: ruleB.id },
  );
  typia.assert(fetchedB);
  TestValidator.equals("rule id matches created rule", fetchedB.id, ruleB.id);
  TestValidator.equals(
    "rule belongs to community B",
    fetchedB.community_platform_community_id,
    communityB.id,
  );

  // 6) Negative scenario: try to fetch the rule under community A
  await TestValidator.error(
    "fetching the rule under the wrong community should throw",
    async () => {
      await api.functional.communityPlatform.communities.rules.at(connection, {
        communityId: communityA.id,
        ruleId: ruleB.id,
      });
    },
  );
}
