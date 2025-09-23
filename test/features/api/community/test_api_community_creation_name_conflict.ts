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
 * Ensure duplicate community names are rejected.
 *
 * Steps:
 *
 * 1. Join as a community member (authentication).
 * 2. Query categories preferring active ones and select a category id.
 * 3. Create a community with a valid unique name in the selected category.
 * 4. Attempt to create another community with the same name (expect error).
 * 5. Validate ownership and basic invariants on the created entity.
 */
export async function test_api_community_creation_name_conflict(
  connection: api.IConnection,
) {
  // 1) Authenticate (join) as community member
  const joinBody = {
    username: RandomGenerator.name(1),
    email: typia.random<string & tags.Format<"email">>(),
    password: typia.random<string & tags.MinLength<8>>(),
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const authorized: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(connection, {
      body: joinBody,
    });
  typia.assert(authorized);

  // 2) Fetch categories (prefer active)
  const activePage = await api.functional.communityPlatform.categories.index(
    connection,
    {
      body: {
        active: true,
      } satisfies ICommunityPlatformCategory.IRequest,
    },
  );
  typia.assert(activePage);

  let category = activePage.data.find((c) => c.active === true);
  if (!category) {
    const anyPage = await api.functional.communityPlatform.categories.index(
      connection,
      { body: {} satisfies ICommunityPlatformCategory.IRequest },
    );
    typia.assert(anyPage);
    TestValidator.predicate(
      "at least one category should exist",
      anyPage.data.length > 0,
    );
    category = anyPage.data[0];
  }
  // Stabilize the selected category as non-null
  const chosenCategory = category; // control flow guarantees non-null here

  // 3) Create a community with a unique, valid name
  const communityName: string = `c${RandomGenerator.alphaNumeric(12)}`; // starts with letter, 13 chars total
  const created: ICommunityPlatformCommunity =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      {
        body: {
          name: communityName,
          community_platform_category_id: chosenCategory.id,
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(created);

  // Validate creation invariants
  TestValidator.equals(
    "created community name equals requested name",
    created.name,
    communityName,
  );
  TestValidator.equals(
    "created community category id equals selected category id",
    created.community_platform_category_id,
    chosenCategory.id,
  );
  TestValidator.equals(
    "community owner matches authenticated user id",
    created.community_platform_user_id,
    authorized.id,
  );

  // 4) Duplicate creation attempt with the same name must fail
  await TestValidator.error(
    "duplicate community name should be rejected",
    async () => {
      await api.functional.communityPlatform.communityMember.communities.create(
        connection,
        {
          body: {
            name: communityName,
            community_platform_category_id: chosenCategory.id,
          } satisfies ICommunityPlatformCommunity.ICreate,
        },
      );
    },
  );
}
