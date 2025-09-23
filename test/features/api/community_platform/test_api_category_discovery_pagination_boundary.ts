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
 * Validate pagination boundary conditions for public category discovery.
 *
 * This test focuses on edge cases of pagination parameters for the public
 * endpoint PATCH /communityPlatform/categories. It verifies that:
 *
 * 1. Limit=1 returns at most one record and the pagination.limit reflects 1
 * 2. Oversized limit (beyond allowed maximum) is either clamped (<=1000) or
 *    rejected
 * 3. Requesting a page beyond the last page returns empty data or clamps to the
 *    last page without throwing
 *
 * Notes:
 *
 * - The endpoint is read-only, public; no authentication flows are required.
 * - Deleted records are excluded server-side by default; not explicitly validated
 *   here due to lack of write APIs.
 */
export async function test_api_category_discovery_pagination_boundary(
  connection: api.IConnection,
) {
  // 0) Baseline fetch to understand current pagination state
  const baseline = await api.functional.communityPlatform.categories.index(
    connection,
    { body: {} satisfies ICommunityPlatformCategory.IRequest },
  );
  typia.assert(baseline);

  // 1) Boundary: limit=1 should return at most one record
  const single = await api.functional.communityPlatform.categories.index(
    connection,
    {
      body: { page: 1, limit: 1 } satisfies ICommunityPlatformCategory.IRequest,
    },
  );
  typia.assert(single);
  TestValidator.equals(
    "limit=1 reflected in pagination.limit",
    single.pagination.limit,
    1,
  );
  TestValidator.predicate(
    "limit=1 returns at most one item",
    single.data.length <= 1,
  );

  // 2) Boundary: Oversized limit beyond allowed maximum
  let oversizedErrored = false;
  let oversized: IPageICommunityPlatformCategory.ISummary | null = null;
  try {
    const body = {
      limit: 1_000_000,
    } satisfies ICommunityPlatformCategory.IRequest;
    oversized = await api.functional.communityPlatform.categories.index(
      connection,
      { body },
    );
    typia.assert(oversized);
  } catch {
    oversizedErrored = true;
  }
  if (oversized !== null) {
    // If service chose clamping behavior, ensure it does not exceed schema max (<= 1000)
    TestValidator.predicate(
      "oversized limit is clamped to <= 1000",
      oversized.pagination.limit <= 1000 && oversized.pagination.limit >= 1,
    );
  } else {
    // If rejected, consider it valid behavior for an out-of-range request
    TestValidator.predicate(
      "oversized limit is rejected by validation",
      oversizedErrored === true,
    );
  }

  // 3) Boundary: Request page beyond the last page
  const totalPages = baseline.pagination.pages; // >= 0
  const beyondPage = (totalPages || 0) + 1; // at least 1
  const beyond = await api.functional.communityPlatform.categories.index(
    connection,
    {
      body: {
        page: beyondPage,
        limit: 1,
      } satisfies ICommunityPlatformCategory.IRequest,
    },
  );
  typia.assert(beyond);
  TestValidator.equals(
    "beyond call echoes limit=1",
    beyond.pagination.limit,
    1,
  );

  if (baseline.pagination.records === 0) {
    // When no records exist, any page should return empty
    TestValidator.equals(
      "no records -> empty data on any page",
      beyond.data.length,
      0,
    );
  } else {
    // When records exist, either empty data for beyond-last page
    // OR clamped to last page (current equals total pages)
    const emptyBeyond = beyond.data.length === 0;
    const clampedToLast =
      totalPages > 0 && beyond.pagination.current === totalPages;

    TestValidator.predicate(
      "beyond-last page returns empty or clamps to last page",
      emptyBeyond || clampedToLast,
    );

    // Also ensure current page does not exceed total pages if clamped
    TestValidator.predicate(
      "current page not greater than total pages when clamped",
      beyond.pagination.current <= Math.max(1, totalPages),
    );
  }
}
