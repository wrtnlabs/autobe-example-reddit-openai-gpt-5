import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ICommunityPlatformReservedTerm } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformReservedTerm";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformReservedTerm } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformReservedTerm";

export async function test_api_reserved_term_search_pagination_sorting(
  connection: api.IConnection,
) {
  // Helper: compare ISO-8601 desc order
  const isoDesc = (a: string, b: string) => Date.parse(b) - Date.parse(a);

  // 1) Prepare request with valid filters and sorting
  const appliesTo = "community_name";
  const query = RandomGenerator.alphabets(2); // MinLength<2>
  const limit = 5;

  const bodyPage1 = {
    page: 1,
    limit,
    query,
    applies_to: appliesTo,
    active: true,
    sort_by: "created_at",
    sort_dir: "desc",
  } satisfies ICommunityPlatformReservedTerm.IRequest;

  // 2) Call page 1
  const page1 = await api.functional.communityPlatform.reservedTerms.index(
    connection,
    { body: bodyPage1 },
  );
  typia.assert<IPageICommunityPlatformReservedTerm.ISummary>(page1);

  // 3) Validate page 1
  // 3-1) Sorted by created_at desc
  const page1Sorted = page1.data.every((row, i, arr) =>
    i === 0 ? true : isoDesc(arr[i - 1].created_at, row.created_at) >= 0,
  );
  TestValidator.predicate("page1 is sorted by created_at desc", page1Sorted);

  // 3-2) Filters: applies_to and active
  TestValidator.predicate(
    "page1 entries match applies_to and active=true",
    page1.data.every((r) => r.applies_to === appliesTo && r.active === true),
  );

  // 3-3) Optional query verification when data exists
  if (page1.data.length > 0) {
    const qlc = query.toLowerCase();
    TestValidator.predicate(
      "page1 entries reflect query substring in term (case-insensitive)",
      page1.data.every((r) => r.term.toLowerCase().includes(qlc)),
    );
  }

  // 3-4) Uniqueness proxy within page via (applies_to, term.lowercase())
  {
    const seen = new Set<string>();
    const unique = page1.data.every((r) => {
      const key = `${r.applies_to}::${r.term.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    TestValidator.predicate(
      "no duplicate (applies_to, lower(term)) pairs in page1",
      unique,
    );
  }

  // 4) Call page 2 with the same filters
  const bodyPage2 = {
    ...bodyPage1,
    page: 2,
  } satisfies ICommunityPlatformReservedTerm.IRequest;
  const page2 = await api.functional.communityPlatform.reservedTerms.index(
    connection,
    { body: bodyPage2 },
  );
  typia.assert<IPageICommunityPlatformReservedTerm.ISummary>(page2);

  // 5) Validate page 2 ordering and pagination stability
  const page2Sorted = page2.data.every((row, i, arr) =>
    i === 0 ? true : isoDesc(arr[i - 1].created_at, row.created_at) >= 0,
  );
  TestValidator.predicate("page2 is sorted by created_at desc", page2Sorted);

  // No overlapping IDs between page1 and page2
  {
    const ids1 = new Set(page1.data.map((r) => r.id));
    const overlap = page2.data.some((r) => ids1.has(r.id));
    TestValidator.predicate(
      "no overlapping IDs between page1 and page2",
      overlap === false,
    );
  }

  // Boundary monotonicity across pages (if both non-empty)
  if (page1.data.length > 0 && page2.data.length > 0) {
    const last1 = page1.data[page1.data.length - 1].created_at;
    const first2 = page2.data[0].created_at;
    TestValidator.predicate(
      "page boundary preserves desc ordering (last of page1 >= first of page2)",
      isoDesc(last1, first2) >= 0,
    );
  }

  // 6) Negative tests (business validation)
  // 6-1) page=0 violates Minimum<1>
  await TestValidator.error(
    "page=0 should be rejected by validation",
    async () => {
      await api.functional.communityPlatform.reservedTerms.index(connection, {
        body: {
          page: 0,
          limit,
          query,
          applies_to: appliesTo,
          active: true,
          sort_by: "created_at",
          sort_dir: "desc",
        } satisfies ICommunityPlatformReservedTerm.IRequest,
      });
    },
  );

  // 6-2) query length 1 violates MinLength<2>
  await TestValidator.error(
    "query length 1 should be rejected by validation",
    async () => {
      await api.functional.communityPlatform.reservedTerms.index(connection, {
        body: {
          page: 1,
          limit,
          query: RandomGenerator.alphabets(1),
          applies_to: appliesTo,
          active: true,
          sort_by: "created_at",
          sort_dir: "desc",
        } satisfies ICommunityPlatformReservedTerm.IRequest,
      });
    },
  );
}
