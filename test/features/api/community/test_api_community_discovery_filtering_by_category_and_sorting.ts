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
import type { IPageICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformCommunity";

/**
 * Public community discovery with category filtering and sorting.
 *
 * Workflow:
 *
 * 1. Fetch categories (prefer active) and pick a primary category. Optionally pick
 *    a secondary category.
 * 2. Join as a community member and create a community in the primary category. If
 *    available, create another in a different category.
 * 3. Discover communities with category filter and created_at desc sorting;
 *    validate category membership, inclusion of created item, sorting order,
 *    and pagination metadata.
 * 4. Repeat discovery without authentication to confirm public access and same
 *    guarantees.
 * 5. Optionally run discovery with a short query substring to validate search
 *    returns the created community.
 */
export async function test_api_community_discovery_filtering_by_category_and_sorting(
  connection: api.IConnection,
) {
  // Helpers
  const makeSlug = (len: number): string => {
    const alpha = "abcdefghijklmnopqrstuvwxyz";
    const alnum = "abcdefghijklmnopqrstuvwxyz0123456789";
    const midchars = "abcdefghijklmnopqrstuvwxyz0123456789-_";
    const L = Math.max(3, Math.min(32, len));
    const start = alpha[Math.floor(Math.random() * alpha.length)];
    const middleLen = Math.max(0, L - 2);
    let middle = "";
    for (let i = 0; i < middleLen; ++i)
      middle += midchars[Math.floor(Math.random() * midchars.length)];
    const end = alnum[Math.floor(Math.random() * alnum.length)];
    return `${start}${middle}${end}`;
  };
  const isSortedDescBy = (arr: { created_at: string }[]): boolean => {
    for (let i = 1; i < arr.length; ++i) {
      const prev = new Date(arr[i - 1].created_at).getTime();
      const curr = new Date(arr[i].created_at).getTime();
      if (prev < curr) return false;
    }
    return true;
  };

  // 1) Fetch categories (active first)
  const catReqActive = {
    page: 1,
    limit: 50,
    active: true,
    sortBy: "display_order",
    direction: "asc",
  } satisfies ICommunityPlatformCategory.IRequest;
  const activeCats = await api.functional.communityPlatform.categories.index(
    connection,
    { body: catReqActive },
  );
  typia.assert(activeCats);

  let categories = activeCats;
  if (!activeCats.data.length) {
    const catReqAny = {
      limit: 50,
    } satisfies ICommunityPlatformCategory.IRequest;
    categories = await api.functional.communityPlatform.categories.index(
      connection,
      { body: catReqAny },
    );
    typia.assert(categories);
  }
  TestValidator.predicate(
    "at least one category must be available",
    categories.data.length > 0,
  );

  const primaryCategory = categories.data[0];
  const secondaryCategory = categories.data.find(
    (c) => c.id !== primaryCategory.id,
  );

  // 2) Join as community member and create communities
  const joinBody = {
    username: `user_${RandomGenerator.alphaNumeric(8)}`,
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const authorized = await api.functional.auth.communityMember.join(
    connection,
    {
      body: joinBody,
    },
  );
  typia.assert(authorized);

  const createPrimaryBody = {
    name: makeSlug(10),
    community_platform_category_id: primaryCategory.id,
    description: RandomGenerator.paragraph({ sentences: 8 }),
  } satisfies ICommunityPlatformCommunity.ICreate;
  const createdPrimary =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      { body: createPrimaryBody },
    );
  typia.assert(createdPrimary);
  TestValidator.equals(
    "created primary community belongs to selected category",
    createdPrimary.community_platform_category_id,
    primaryCategory.id,
  );

  let createdSecondary: ICommunityPlatformCommunity | undefined;
  if (secondaryCategory) {
    const createSecondaryBody = {
      name: makeSlug(11),
      community_platform_category_id: secondaryCategory.id,
      description: RandomGenerator.paragraph({ sentences: 6 }),
    } satisfies ICommunityPlatformCommunity.ICreate;
    createdSecondary =
      await api.functional.communityPlatform.communityMember.communities.create(
        connection,
        { body: createSecondaryBody },
      );
    typia.assert(createdSecondary);
  }

  // 3) Discovery with category filter and sorting by created_at desc
  const discoveryBody = {
    page: 1,
    limit: 20,
    community_platform_category_id: primaryCategory.id,
    sort_by: "created_at",
    sort_dir: "desc",
  } satisfies ICommunityPlatformCommunity.IRequest;
  const page1 = await api.functional.communityPlatform.communities.index(
    connection,
    { body: discoveryBody },
  );
  typia.assert(page1);

  // Validate category membership
  TestValidator.predicate(
    "all discovered communities belong to the selected category",
    page1.data.every(
      (d) => d.community_platform_category_id === primaryCategory.id,
    ),
  );
  // Validate created community is in result set
  TestValidator.predicate(
    "created primary-category community appears in discovery results",
    page1.data.some((d) => d.id === createdPrimary.id),
  );
  // Validate sorting order
  TestValidator.predicate(
    "results are sorted by created_at in descending order",
    isSortedDescBy(page1.data),
  );
  // Validate pagination metadata
  TestValidator.predicate(
    "pagination current page should be >= 1",
    page1.pagination.current >= 1,
  );
  TestValidator.equals(
    "pagination limit equals requested limit",
    page1.pagination.limit,
    discoveryBody.limit,
  );
  // Ensure different-category community is excluded when filter applied
  if (createdSecondary) {
    TestValidator.predicate(
      "community from a different category is excluded by category filter",
      !page1.data.some((d) => d.id === createdSecondary!.id),
    );
  }

  // 4) Public access: same discovery without auth header
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  const page1Public = await api.functional.communityPlatform.communities.index(
    unauthConn,
    { body: discoveryBody },
  );
  typia.assert(page1Public);
  TestValidator.predicate(
    "public discovery also returns only selected category",
    page1Public.data.every(
      (d) => d.community_platform_category_id === primaryCategory.id,
    ),
  );
  TestValidator.predicate(
    "public discovery sorted by created_at desc",
    isSortedDescBy(page1Public.data),
  );
  TestValidator.predicate(
    "public discovery includes the created primary-category community",
    page1Public.data.some((d) => d.id === createdPrimary.id),
  );

  // 5) Optional search: use a 2+ chars prefix of the created name
  const queryPrefix = createdPrimary.name.slice(0, 2);
  if (queryPrefix.length >= 2) {
    const discoverySearchBody = {
      ...discoveryBody,
      query: queryPrefix,
    } satisfies ICommunityPlatformCommunity.IRequest;
    const pageSearch = await api.functional.communityPlatform.communities.index(
      connection,
      { body: discoverySearchBody },
    );
    typia.assert(pageSearch);
    TestValidator.predicate(
      "search with query prefix returns the created community",
      pageSearch.data.some((d) => d.id === createdPrimary.id),
    );
  }
}
