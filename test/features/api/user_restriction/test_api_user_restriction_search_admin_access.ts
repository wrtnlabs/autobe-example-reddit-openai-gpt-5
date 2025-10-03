import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformSiteAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSiteAdmin";
import type { ICommunityPlatformSiteAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSiteAdminJoin";
import type { ICommunityPlatformUserRestriction } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUserRestriction";
import type { IEOrderDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IEOrderDirection";
import type { IEUserRestrictionSortBy } from "@ORGANIZATION/PROJECT-api/lib/structures/IEUserRestrictionSortBy";
import type { IEUserRestrictionType } from "@ORGANIZATION/PROJECT-api/lib/structures/IEUserRestrictionType";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformUserRestriction } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformUserRestriction";

/**
 * SiteAdmin can search/list user restrictions with sorting and pagination.
 *
 * Business goal
 *
 * - Ensure a freshly joined SiteAdmin can access the administrative
 *   user-restriction search endpoint and receive a valid, well-ordered page
 *   response. Creation of restriction data is not part of this test; therefore,
 *   an empty result set is acceptable.
 *
 * Steps
 *
 * 1. Join as SiteAdmin (auto-auth via SDK token handling)
 * 2. Call userRestrictions.index with { cursor: null, sortBy: "createdAt", order:
 *    "desc", limit }
 * 3. Validate:
 *
 *    - Response typing via typia.assert
 *    - Data.length <= limit and pagination.limit is positive (and typically equals
 *         requested)
 *    - Deterministic ordering: createdAt DESC, id DESC for ties
 *    - No duplicates within the page
 * 4. Validate basic filters on current dataset (empty acceptable):
 *
 *    - ActiveOnly=true -> each item has revokedAt === null
 *    - RestrictionType filter for both read_only and suspended
 */
export async function test_api_user_restriction_search_admin_access(
  connection: api.IConnection,
) {
  // 1) Admin join to obtain authenticated context
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    username: RandomGenerator.alphabets(10),
    password: RandomGenerator.alphaNumeric(12),
    displayName: RandomGenerator.name(1),
  } satisfies ICommunityPlatformSiteAdminJoin.ICreate;
  const admin: ICommunityPlatformSiteAdmin.IAuthorized =
    await api.functional.auth.siteAdmin.join(connection, { body: joinBody });
  typia.assert(admin);

  // Helper: verify ordering by createdAt DESC, then id DESC for ties
  const isSortedByCreatedThenIdDesc = (
    items: ICommunityPlatformUserRestriction[],
  ): boolean => {
    for (let i = 1; i < items.length; ++i) {
      const prev = items[i - 1];
      const curr = items[i];
      const prevTime = new Date(prev.createdAt).getTime();
      const currTime = new Date(curr.createdAt).getTime();
      if (prevTime < currTime) return false; // must be non-increasing
      if (prevTime === currTime && prev.id < curr.id) return false; // id DESC
    }
    return true;
  };

  // 2) Baseline search: Newest ordering (createdAt DESC), explicit null cursor
  const limitValue = 5; // small page size to exercise per-page constraints
  const baseRequest = {
    cursor: null, // explicit null (null vs undefined)
    sortBy: "createdAt" as IEUserRestrictionSortBy,
    order: "desc" as IEOrderDirection,
    limit: limitValue,
  } satisfies ICommunityPlatformUserRestriction.IRequest;

  const page: IPageICommunityPlatformUserRestriction =
    await api.functional.communityPlatform.siteAdmin.userRestrictions.index(
      connection,
      { body: baseRequest },
    );
  typia.assert(page);

  // 3) Assertions on pagination and ordering
  TestValidator.predicate(
    "page size should not exceed requested limit",
    page.data.length <= limitValue,
  );
  TestValidator.predicate(
    "pagination.limit should be positive",
    Number(page.pagination.limit) > 0,
  );
  TestValidator.predicate(
    "data should be sorted by createdAt DESC then id DESC",
    isSortedByCreatedThenIdDesc(page.data),
  );
  TestValidator.predicate(
    "IDs within a page should be unique",
    (() => {
      const ids = page.data.map((r) => r.id);
      return new Set(ids).size === ids.length;
    })(),
  );

  // 4) Filtering: activeOnly=true -> revokedAt must be null when results exist
  const activeOnlyRequest = {
    cursor: null,
    sortBy: "createdAt" as IEUserRestrictionSortBy,
    order: "desc" as IEOrderDirection,
    limit: limitValue,
    activeOnly: true,
  } satisfies ICommunityPlatformUserRestriction.IRequest;
  const activePage: IPageICommunityPlatformUserRestriction =
    await api.functional.communityPlatform.siteAdmin.userRestrictions.index(
      connection,
      { body: activeOnlyRequest },
    );
  typia.assert(activePage);
  TestValidator.predicate(
    "activeOnly filter returns only records with revokedAt === null (or empty set)",
    activePage.data.every((r) => r.revokedAt === null),
  );

  // 5) Filtering by restrictionType for both enumerated values
  const types: readonly IEUserRestrictionType[] = [
    "read_only",
    "suspended",
  ] as const;
  for (const t of types) {
    const typeRequest = {
      cursor: null,
      sortBy: "createdAt" as IEUserRestrictionSortBy,
      order: "desc" as IEOrderDirection,
      limit: limitValue,
      restrictionType: t,
    } satisfies ICommunityPlatformUserRestriction.IRequest;
    const typePage: IPageICommunityPlatformUserRestriction =
      await api.functional.communityPlatform.siteAdmin.userRestrictions.index(
        connection,
        { body: typeRequest },
      );
    typia.assert(typePage);
    TestValidator.predicate(
      `restrictionType filter returns only ${t} (or empty set)`,
      typePage.data.every((r) => r.restrictionType === t),
    );
    TestValidator.predicate(
      `typePage is sorted by createdAt DESC then id DESC for ${t}`,
      isSortedByCreatedThenIdDesc(typePage.data),
    );
  }
}
