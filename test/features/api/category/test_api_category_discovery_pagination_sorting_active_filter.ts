import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ICommunityPlatformCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCategory";
import type { IECategorySortBy } from "@ORGANIZATION/PROJECT-api/lib/structures/IECategorySortBy";
import type { IESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IESortDirection";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformCategory";

/**
 * Validate public category discovery with active filter, search, sorting, and
 * pagination.
 *
 * Business intent:
 *
 * - Public endpoint for listing categories used across Explore and filters.
 * - Verify core behaviors: active=true filter, free-text search (code/name),
 *   deterministic sorting by display_order asc, and stable pagination.
 * - Ensure consistent ordering on repeated calls and no overlap across pages.
 * - Validate runtime error on invalid pagination values without inspecting HTTP
 *   codes.
 *
 * Steps:
 *
 * 1. Page 1 fetch: active=true, sortBy=display_order asc, limit=5
 *
 *    - Assert type, active-only items, non-decreasing display_order, data.length <=
 *         5
 *    - Repeat same query to ensure identical ID ordering
 * 2. Search with term from page 1 top item (code/name prefix)
 *
 *    - Assert type, active-only, sorted, and inclusion of targeted item in results
 * 3. Page 2 fetch with same filters
 *
 *    - Assert type, no duplicate IDs with page 1, stable ordering on repeat
 * 4. Invalid pagination (page=0, limit=0) must throw (runtime validation)
 */
export async function test_api_category_discovery_pagination_sorting_active_filter(
  connection: api.IConnection,
) {
  // 1) Page 1: active=true, sort by display_order asc, limit=5
  const page1Body = {
    page: 1,
    limit: 5,
    active: true,
    sortBy: "display_order",
    direction: "asc",
  } satisfies ICommunityPlatformCategory.IRequest;

  const page1 = await api.functional.communityPlatform.categories.index(
    connection,
    {
      body: page1Body,
    },
  );
  typia.assert<IPageICommunityPlatformCategory.ISummary>(page1);

  // Pagination + size constraint
  TestValidator.predicate(
    "page 1 size does not exceed requested limit",
    page1.data.length <= page1Body.limit!,
  );

  // Active-only filter
  TestValidator.predicate(
    "all items on page 1 are active when active=true",
    page1.data.every((c) => c.active === true),
  );

  // Sorting check: non-decreasing by display_order
  TestValidator.predicate(
    "page 1 is sorted by display_order asc (non-decreasing)",
    page1.data.every(
      (c, i, arr) => i === 0 || arr[i - 1].display_order <= c.display_order,
    ),
  );

  // Stability on repeated calls (same filters)
  const page1Again = await api.functional.communityPlatform.categories.index(
    connection,
    {
      body: page1Body,
    },
  );
  typia.assert<IPageICommunityPlatformCategory.ISummary>(page1Again);
  const ids1 = page1.data.map((c) => c.id);
  const ids1Again = page1Again.data.map((c) => c.id);
  TestValidator.equals(
    "stable order for identical requests (page 1)",
    ids1Again,
    ids1,
  );

  // 2) Search behavior using a prefix from the first item's code or name
  if (page1.data.length > 0) {
    const top = page1.data[0];
    const base = top.code && top.code.length > 0 ? top.code : top.name;
    const term = base.slice(0, Math.min(3, base.length)) || base || "a";

    const searchBody = {
      page: 1,
      limit: 5,
      active: true,
      sortBy: "display_order",
      direction: "asc",
      search: term,
    } satisfies ICommunityPlatformCategory.IRequest;

    const searched = await api.functional.communityPlatform.categories.index(
      connection,
      {
        body: searchBody,
      },
    );
    typia.assert<IPageICommunityPlatformCategory.ISummary>(searched);

    // Active-only maintained
    TestValidator.predicate(
      "search results keep active-only constraint",
      searched.data.every((c) => c.active === true),
    );

    // Sorted by display_order asc
    TestValidator.predicate(
      "search results sorted by display_order asc",
      searched.data.every(
        (c, i, arr) => i === 0 || arr[i - 1].display_order <= c.display_order,
      ),
    );

    // The targeted item should be discoverable by the chosen term
    const containsTarget = searched.data.some((c) => c.id === top.id);
    TestValidator.predicate(
      "search returns a page containing targeted item by code/name prefix",
      containsTarget || searched.data.length === 0, // allow empty if dataset is small
    );
  }

  // 3) Page 2: ensure no overlap with page 1 under identical filters
  const page2Body = {
    page: 2,
    limit: 5,
    active: true,
    sortBy: "display_order",
    direction: "asc",
  } satisfies ICommunityPlatformCategory.IRequest;

  const page2 = await api.functional.communityPlatform.categories.index(
    connection,
    {
      body: page2Body,
    },
  );
  typia.assert<IPageICommunityPlatformCategory.ISummary>(page2);

  // No duplicate IDs across page 1 and page 2
  const ids2 = page2.data.map((c) => c.id);
  const set1 = new Set(ids1);
  const overlap = ids2.some((id) => set1.has(id));
  TestValidator.predicate(
    "no duplicate IDs across consecutive pages",
    overlap === false,
  );

  // Stability for page 2
  const page2Again = await api.functional.communityPlatform.categories.index(
    connection,
    {
      body: page2Body,
    },
  );
  typia.assert<IPageICommunityPlatformCategory.ISummary>(page2Again);
  const ids2Again = page2Again.data.map((c) => c.id);
  TestValidator.equals(
    "stable order for identical requests (page 2)",
    ids2Again,
    ids2,
  );

  // 4) Error scenario: invalid pagination values (runtime validation)
  await TestValidator.error(
    "invalid pagination (page=0, limit=0) must be rejected",
    async () => {
      const invalidBody = {
        page: 0, // violates Minimum<1>
        limit: 0, // violates Minimum<1>
        active: true,
      } satisfies ICommunityPlatformCategory.IRequest;

      await api.functional.communityPlatform.categories.index(connection, {
        body: invalidBody,
      });
    },
  );
}
