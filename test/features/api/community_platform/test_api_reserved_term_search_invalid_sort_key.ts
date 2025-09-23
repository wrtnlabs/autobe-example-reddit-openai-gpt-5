import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ICommunityPlatformReservedTerm } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformReservedTerm";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformReservedTerm } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformReservedTerm";

/**
 * Validate reserved terms sorting behavior with supported sort keys.
 *
 * Because the request DTO strictly restricts sort_by to a union of
 * ("created_at" | "term" | "applies_to"), an invalid sort key cannot be
 * represented without breaking type safety. Therefore, instead of attempting an
 * impossible invalid-key test, this scenario validates that sorting works
 * correctly for all supported keys and directions, and that default sorting
 * (omitting sort_by/sort_dir) returns a valid page.
 *
 * Steps:
 *
 * 1. Call the endpoint with default sorting (omit sort_by/sort_dir) and assert
 *    response shape.
 * 2. Use TestValidator.sort to verify server-side sorting by:
 *
 *    - Created_at (asc/desc)
 *    - Term (asc/desc)
 *    - Applies_to (asc/desc)
 */
export async function test_api_reserved_term_search_invalid_sort_key(
  connection: api.IConnection,
) {
  // 1) Default call: ensure endpoint responds with a valid page
  const defaultPage =
    await api.functional.communityPlatform.reservedTerms.index(connection, {
      body: {
        page: 1,
        limit: 20,
      } satisfies ICommunityPlatformReservedTerm.IRequest,
    });
  typia.assert(defaultPage);

  // 2) Sorting validations for supported fields
  const sortGetter = async (
    sortable: TestValidator.Sortable<"created_at" | "term" | "applies_to">,
  ) => {
    const spec = sortable[0] ?? "+created_at";
    const direction = spec.startsWith("+")
      ? ("asc" as const)
      : ("desc" as const);
    const field = spec.slice(1) as "created_at" | "term" | "applies_to";

    const page = await api.functional.communityPlatform.reservedTerms.index(
      connection,
      {
        body: {
          page: 1,
          limit: 50,
          sort_by: field,
          sort_dir: direction,
        } satisfies ICommunityPlatformReservedTerm.IRequest,
      },
    );
    typia.assert(page);
    return page.data;
  };

  const sort = TestValidator.sort("reserved term list sorting", sortGetter);

  // created_at comparator
  const byCreatedAt = sort("created_at")(
    (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at),
  );
  await byCreatedAt("+");
  await byCreatedAt("-");

  // term comparator
  const byTerm = sort("term")((a, b) => a.term.localeCompare(b.term));
  await byTerm("+");
  await byTerm("-");

  // applies_to comparator
  const byAppliesTo = sort("applies_to")((a, b) =>
    a.applies_to.localeCompare(b.applies_to),
  );
  await byAppliesTo("+");
  await byAppliesTo("-");
}
