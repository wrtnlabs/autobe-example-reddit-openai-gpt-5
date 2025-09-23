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

export async function test_api_community_creation_success_with_active_category(
  connection: api.IConnection,
) {
  /**
   * Happy-path: an authenticated community member creates a community using a
   * valid, active category.
   *
   * Steps:
   *
   * 1. Join as community member (obtains tokens automatically via SDK)
   * 2. List categories with active=true and deterministic sort
   * 3. Create a community with a unique, well-formed name and the selected active
   *    category id
   * 4. Validate returned entity fields and ownership/category linkage
   */
  // 1) Join as community member
  const username: string = `user_${RandomGenerator.alphaNumeric(8)}`;
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const password: string = RandomGenerator.alphaNumeric(12);

  const authorized: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(connection, {
      body: {
        username,
        email,
        password,
      } satisfies ICommunityPlatformCommunityMember.ICreate,
    });
  typia.assert(authorized);

  // 2) List categories (prefer active ones)
  const pageActive = await api.functional.communityPlatform.categories.index(
    connection,
    {
      body: {
        active: true,
        sortBy: "display_order",
        direction: "asc",
      } satisfies ICommunityPlatformCategory.IRequest,
    },
  );
  typia.assert(pageActive);

  let categories: ICommunityPlatformCategory.ISummary[] = pageActive.data;
  if (categories.length === 0) {
    // Fallback without filters to ensure test resilience in minimal datasets
    const pageAny = await api.functional.communityPlatform.categories.index(
      connection,
      { body: {} satisfies ICommunityPlatformCategory.IRequest },
    );
    typia.assert(pageAny);
    categories = pageAny.data;
  }

  // Ensure we have at least one category to proceed
  TestValidator.predicate(
    "at least one category should be retrievable",
    categories.length > 0,
  );
  if (categories.length === 0)
    throw new Error("No categories available for testing.");

  const selected: ICommunityPlatformCategory.ISummary =
    categories.find((c) => c.active === true) ?? categories[0]!;

  // 3) Create a community
  const leadLetter = RandomGenerator.alphabets(1); // ensure starts with a letter
  const tail = RandomGenerator.alphaNumeric(9); // keep within 3–32 total length
  const communityName: string = `${leadLetter}${tail}`; // matches ^[A-Za-z][A-Za-z0-9_-]{1,30}[A-Za-z0-9]$

  const createBody = {
    name: communityName,
    community_platform_category_id: selected.id,
    description: RandomGenerator.paragraph({ sentences: 8 }),
  } satisfies ICommunityPlatformCommunity.ICreate;

  const created: ICommunityPlatformCommunity =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      { body: createBody },
    );
  typia.assert(created);

  // 4) Validate linkage and field echoes
  TestValidator.equals(
    "created community owner should match authorized member id",
    created.community_platform_user_id,
    authorized.id,
  );
  TestValidator.equals(
    "created community category id should match selected category id",
    created.community_platform_category_id,
    selected.id,
  );
  TestValidator.equals(
    "created community name should equal requested name",
    created.name,
    communityName,
  );
  TestValidator.equals(
    "created community description should equal requested description",
    created.description ?? null,
    createBody.description ?? null,
  );
}
