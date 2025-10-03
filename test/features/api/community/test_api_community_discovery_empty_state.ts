import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";
import type { IECommunityCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityCategory";
import type { IECommunitySort } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunitySort";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformCommunity";

/**
 * Community discovery empty-state should return a valid page with an empty
 * list.
 *
 * Business goal:
 *
 * - When there are no communities in the system, the discovery/explore API must
 *   respond with 200 and a well-formed page object whose data array is empty,
 *   and pagination metadata is consistent with zero records.
 *
 * Test flow:
 *
 * 1. Assume clean database (handled by suite-level setup).
 * 2. Call discovery with sort = "recentlyCreated" only (no filters, no cursor).
 * 3. Validate response typing and business rules:
 *
 *    - Data.length === 0
 *    - Pagination.records === 0
 *    - Pagination.pages === 0
 *    - Pagination.current >= 0
 *    - Pagination.limit within [1, 100]
 *
 * Notes:
 *
 * - The response schema does not define a nextCursor; therefore, we do not assert
 *   it. We validate only the properties that exist in the DTOs.
 */
export async function test_api_community_discovery_empty_state(
  connection: api.IConnection,
) {
  // 1) Prepare minimal request body with explicit sort
  const requestBody = {
    sort: "recentlyCreated",
  } satisfies ICommunityPlatformCommunity.IRequest;

  // 2) Execute discovery listing
  const page = await api.functional.communityPlatform.communities.index(
    connection,
    { body: requestBody },
  );

  // 3) Type-level guarantee for response payload
  typia.assert(page);

  // 4) Business validations for empty-state
  TestValidator.equals(
    "communities list should be empty in a clean dataset",
    page.data.length,
    0,
  );
  TestValidator.equals(
    "pagination.records should be 0 when no communities exist",
    page.pagination.records,
    0,
  );
  TestValidator.equals(
    "pagination.pages should be 0 when no communities exist",
    page.pagination.pages,
    0,
  );
  TestValidator.predicate(
    "pagination.current is non-negative per spec",
    page.pagination.current >= 0,
  );
  TestValidator.predicate(
    "pagination.limit within recommended bounds (1..100)",
    page.pagination.limit >= 1 && page.pagination.limit <= 100,
  );
}
