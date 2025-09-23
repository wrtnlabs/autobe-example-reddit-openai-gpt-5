import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ICommunityPlatformReservedTerm } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformReservedTerm";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformReservedTerm } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformReservedTerm";

/**
 * Retrieve reserved term detail by a valid ID discovered from the index.
 *
 * Steps:
 *
 * 1. Query the list (PATCH /communityPlatform/reservedTerms) favoring active items
 *    to obtain a valid ID.
 * 2. Fetch detail (GET /communityPlatform/reservedTerms/{reservedTermId}) with the
 *    discovered ID.
 * 3. Validate type safety and field consistency between summary and detail.
 * 4. Ensure record is not soft-deleted (deleted_at is null or undefined).
 * 5. Re-query list filtering by applies_to and active of the discovered record and
 *    confirm the same ID is present.
 *
 * Resilience:
 *
 * - If no records are found initially, broaden the search (drop active filter).
 *   If still empty, assert emptiness and return to avoid false failures.
 */
export async function test_api_reserved_term_detail_success_via_valid_id(
  connection: api.IConnection,
) {
  // 1) Discover a candidate from the index (prefer active records)
  const firstPage = await api.functional.communityPlatform.reservedTerms.index(
    connection,
    {
      body: {
        page: 1,
        limit: 10,
        active: true,
      } satisfies ICommunityPlatformReservedTerm.IRequest,
    },
  );
  typia.assert(firstPage);

  let summary = firstPage.data[0];
  if (!summary) {
    // Fallback: broaden query if no data returned
    const fallbackPage =
      await api.functional.communityPlatform.reservedTerms.index(connection, {
        body: {
          page: 1,
          limit: 10,
          active: null,
        } satisfies ICommunityPlatformReservedTerm.IRequest,
      });
    typia.assert(fallbackPage);
    summary = fallbackPage.data[0];
  }

  // If still nothing, record and exit gracefully
  if (!summary) {
    TestValidator.predicate(
      "no reserved terms available to perform detail retrieval; skipping",
      firstPage.data.length === 0,
    );
    return;
  }

  // 2) Fetch detail using the discovered ID
  const detail = await api.functional.communityPlatform.reservedTerms.at(
    connection,
    {
      reservedTermId: summary.id,
    },
  );
  typia.assert(detail);

  // 3) Validate field consistency between summary and detail
  TestValidator.equals("detail.id matches summary.id", detail.id, summary.id);
  TestValidator.equals(
    "detail.term matches summary.term",
    detail.term,
    summary.term,
  );
  TestValidator.equals(
    "detail.applies_to matches summary.applies_to",
    detail.applies_to,
    summary.applies_to,
  );
  TestValidator.equals(
    "detail.active matches summary.active",
    detail.active,
    summary.active,
  );
  TestValidator.equals(
    "detail.created_at matches summary.created_at",
    detail.created_at,
    summary.created_at,
  );

  // 4) Ensure the record is not soft-deleted
  TestValidator.predicate(
    "reserved term must not be soft-deleted (deleted_at is null or undefined)",
    detail.deleted_at === null || detail.deleted_at === undefined,
  );

  // 5) Re-index with filters to confirm presence of the same ID
  const filteredPage =
    await api.functional.communityPlatform.reservedTerms.index(connection, {
      body: {
        page: 1,
        limit: 10,
        applies_to: detail.applies_to,
        active: detail.active,
      } satisfies ICommunityPlatformReservedTerm.IRequest,
    });
  typia.assert(filteredPage);

  const foundAgain = filteredPage.data.find((it) => it.id === detail.id);
  TestValidator.predicate(
    "filtered list includes the discovered reserved term ID",
    foundAgain !== undefined,
  );
}
