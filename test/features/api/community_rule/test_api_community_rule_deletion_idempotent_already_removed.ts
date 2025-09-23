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
 * Idempotent deletion of community rules: deleting an already removed rule
 * should fail.
 *
 * Business flow:
 *
 * 1. Authenticate as communityMember (Owner A).
 * 2. Discover an active category for community creation.
 * 3. Create a community under the selected category.
 * 4. Create a community rule.
 * 5. Delete the rule once (should succeed).
 * 6. Attempt to delete the same rule again (must throw an error).
 *
 * Notes:
 *
 * - Use SDK-managed authentication via join endpoint; do not touch headers.
 * - Validate non-void API responses with typia.assert().
 * - For the second delete, verify only that an error occurs (no status code
 *   checks).
 */
export async function test_api_community_rule_deletion_idempotent_already_removed(
  connection: api.IConnection,
) {
  // 1) Authenticate as Owner A (communityMember)
  const auth: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(connection, {
      body: {
        username: `owner_${RandomGenerator.alphaNumeric(8)}`,
        email: typia.random<string & tags.Format<"email">>(),
        password: "Passw0rd!", // length >= 8
      } satisfies ICommunityPlatformCommunityMember.ICreate,
    });
  typia.assert(auth);

  // 2) Discover/select an active category
  const categoriesPage: IPageICommunityPlatformCategory.ISummary =
    await api.functional.communityPlatform.categories.index(connection, {
      body: {
        page: 1 as number, // int32 >= 1
        limit: 20 as number, // int32 1..1000
        active: true,
        sortBy: "display_order" as IECategorySortBy,
        direction: "asc" as IESortDirection,
      } satisfies ICommunityPlatformCategory.IRequest,
    });
  typia.assert(categoriesPage);
  TestValidator.predicate(
    "at least one active category must exist",
    categoriesPage.data.length > 0,
  );
  const category: ICommunityPlatformCategory.ISummary = categoriesPage.data[0]!;

  // 3) Create a community under the selected category
  const communityName: string = `c${RandomGenerator.alphaNumeric(10)}`; // starts with a letter, 11 chars total
  const community: ICommunityPlatformCommunity =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      {
        body: {
          name: communityName,
          community_platform_category_id: category.id,
          description: RandomGenerator.paragraph({ sentences: 6 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);

  // 4) Create a community rule
  const rule: ICommunityPlatformCommunityRule =
    await api.functional.communityPlatform.communityMember.communities.rules.create(
      connection,
      {
        communityId: community.id,
        body: {
          order_index: typia.random<
            number & tags.Type<"int32"> & tags.Minimum<0>
          >(),
          text: RandomGenerator.paragraph({ sentences: 6 }),
        } satisfies ICommunityPlatformCommunityRule.ICreate,
      },
    );
  typia.assert(rule);
  TestValidator.equals(
    "created rule must belong to the created community",
    rule.community_platform_community_id,
    community.id,
  );

  // 5) Delete the rule once (should succeed)
  await api.functional.communityPlatform.communityMember.communities.rules.erase(
    connection,
    {
      communityId: community.id,
      ruleId: rule.id,
    },
  );

  // 6) Attempt to delete the same rule again (must throw an error)
  await TestValidator.error(
    "second deletion of already removed rule should fail",
    async () => {
      await api.functional.communityPlatform.communityMember.communities.rules.erase(
        connection,
        {
          communityId: community.id,
          ruleId: rule.id,
        },
      );
    },
  );
}
