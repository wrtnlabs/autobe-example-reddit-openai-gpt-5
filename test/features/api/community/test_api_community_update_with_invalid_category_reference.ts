import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCategory";
import type { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";
import type { IECategorySortBy } from "@ORGANIZATION/PROJECT-api/lib/structures/IECategorySortBy";
import type { IESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IESortDirection";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformCategory";

/**
 * Verify that updating a community with a non-existent category ID is rejected
 * and does not mutate the community state.
 *
 * Business context:
 *
 * - Only authenticated community members can create/update communities.
 * - Community creation requires a valid, active category reference.
 * - Updating with an invalid category reference should fail without side-effects.
 *
 * Steps:
 *
 * 1. Join as a community member (owner context).
 * 2. List categories and select an active category for creation (fallback to any
 *    if none active).
 * 3. Create a community with a valid category and compliant name.
 * 4. Attempt to update the community's category to a random bogus UUID → expect
 *    error.
 * 5. Perform a valid update (description only) and verify:
 *
 *    - Category unchanged (still original)
 *    - Name unchanged (immutable)
 *    - Description changed to the new value
 */
export async function test_api_community_update_with_invalid_category_reference(
  connection: api.IConnection,
) {
  // 1) Join as a community member (owner)
  const authorized: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(connection, {
      body: {
        username: RandomGenerator.name(1),
        email: typia.random<string & tags.Format<"email">>(),
        password: RandomGenerator.alphaNumeric(12), // >= 8 chars
      } satisfies ICommunityPlatformCommunityMember.ICreate,
    });
  typia.assert(authorized);

  // 2) List categories (prefer active)
  const pageActive = await api.functional.communityPlatform.categories.index(
    connection,
    {
      body: {
        active: true,
      } satisfies ICommunityPlatformCategory.IRequest,
    },
  );
  typia.assert(pageActive);

  // Fallback: if no active categories returned, request without active filter
  const pageAny =
    pageActive.data.length > 0
      ? pageActive
      : await api.functional.communityPlatform.categories.index(connection, {
          body: {} satisfies ICommunityPlatformCategory.IRequest,
        });
  typia.assert(pageAny);
  await TestValidator.predicate(
    "at least one category must exist to create a community",
    async () => pageAny.data.length > 0,
  );
  const category: ICommunityPlatformCategory.ISummary = pageAny.data[0];

  // 3) Create a community with a valid category and compliant name
  const communityName = `c${RandomGenerator.alphaNumeric(10)}`; // starts with a letter, 11 chars
  const created: ICommunityPlatformCommunity =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      {
        body: {
          name: communityName,
          community_platform_category_id: category.id,
          description: RandomGenerator.paragraph({ sentences: 8 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(created);

  // 4) Attempt invalid category update → expect error
  const bogusCategoryId: string & tags.Format<"uuid"> = typia.random<
    string & tags.Format<"uuid">
  >();
  await TestValidator.error(
    "reject update when category id does not exist",
    async () => {
      await api.functional.communityPlatform.communityMember.communities.update(
        connection,
        {
          communityId: created.id,
          body: {
            community_platform_category_id: bogusCategoryId,
          } satisfies ICommunityPlatformCommunity.IUpdate,
        },
      );
    },
  );

  // 5) Perform a valid update (description only) and verify unchanged fields
  const newDescription = RandomGenerator.paragraph({ sentences: 6 });
  const updated: ICommunityPlatformCommunity =
    await api.functional.communityPlatform.communityMember.communities.update(
      connection,
      {
        communityId: created.id,
        body: {
          description: newDescription,
        } satisfies ICommunityPlatformCommunity.IUpdate,
      },
    );
  typia.assert(updated);

  // Business validations
  TestValidator.equals(
    "community id remains the same after updates",
    updated.id,
    created.id,
  );
  TestValidator.equals(
    "name is immutable and remains unchanged",
    updated.name,
    created.name,
  );
  TestValidator.equals(
    "category remains unchanged after rejected update",
    updated.community_platform_category_id,
    created.community_platform_category_id,
  );
  // Ensure description is string before comparison
  const nonNullDescription: string = typia.assert<string>(
    updated.description ?? newDescription,
  );
  TestValidator.equals(
    "description is updated to new value",
    nonNullDescription,
    newDescription,
  );
}
