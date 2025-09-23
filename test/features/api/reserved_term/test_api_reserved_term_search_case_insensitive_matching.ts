import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ICommunityPlatformReservedTerm } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformReservedTerm";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformReservedTerm } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformReservedTerm";

export async function test_api_reserved_term_search_case_insensitive_matching(
  connection: api.IConnection,
) {
  // 0) Baseline listing to get context and validate typing
  const baseline = await api.functional.communityPlatform.reservedTerms.index(
    connection,
    {
      body: {
        page: 1,
        limit: 50,
        query: null,
        applies_to: null,
        active: true,
        sort_by: "created_at",
        sort_dir: "desc",
      } satisfies ICommunityPlatformReservedTerm.IRequest,
    },
  );
  typia.assert(baseline);

  // Derive applies_to (if available) and a substring (len >= 2) from a term
  const derivedAppliesTo: string | null =
    baseline.data.length > 0 ? baseline.data[0].applies_to : null;
  const sourceTerm: string =
    baseline.data.length > 0 ? baseline.data[0].term : "admin";

  const makeSubstring = (s: string): string => {
    const clean = s.trim();
    if (clean.length < 2) return "ad"; // ensure MinLength<2> is satisfied
    const minLen = 2;
    const maxLen = Math.min(6, clean.length);
    const len = Math.max(
      minLen,
      Math.min(
        maxLen,
        minLen + Math.floor(Math.random() * (maxLen - minLen + 1)),
      ),
    );
    const start = Math.floor(Math.random() * (clean.length - len + 1));
    return clean.substring(start, start + len);
  };

  const raw = makeSubstring(sourceTerm);
  const queryLower = raw.toLowerCase();
  const queryUpper = raw.toUpperCase();
  const queryMixed = raw
    .split("")
    .map((ch, i) => (i % 2 === 0 ? ch.toUpperCase() : ch.toLowerCase()))
    .join("");

  // 1) Lower-case query
  const lower = await api.functional.communityPlatform.reservedTerms.index(
    connection,
    {
      body: {
        page: 1,
        limit: 50,
        query: queryLower,
        applies_to: derivedAppliesTo,
        active: true,
        sort_by: "created_at",
        sort_dir: "desc",
      } satisfies ICommunityPlatformReservedTerm.IRequest,
    },
  );
  typia.assert(lower);

  // 2) Upper-case query with the same filters
  const upper = await api.functional.communityPlatform.reservedTerms.index(
    connection,
    {
      body: {
        page: 1,
        limit: 50,
        query: queryUpper,
        applies_to: derivedAppliesTo,
        active: true,
        sort_by: "created_at",
        sort_dir: "desc",
      } satisfies ICommunityPlatformReservedTerm.IRequest,
    },
  );
  typia.assert(upper);

  // Equal content and ordering regardless of casing
  TestValidator.equals(
    "case-insensitive equality between lower and upper query",
    lower,
    upper,
  );

  // 3) Mixed-case query also should match identically
  const mixed = await api.functional.communityPlatform.reservedTerms.index(
    connection,
    {
      body: {
        page: 1,
        limit: 50,
        query: queryMixed,
        applies_to: derivedAppliesTo,
        active: true,
        sort_by: "created_at",
        sort_dir: "desc",
      } satisfies ICommunityPlatformReservedTerm.IRequest,
    },
  );
  typia.assert(mixed);

  TestValidator.equals(
    "mixed-case query produces the same result as lower-case",
    mixed,
    lower,
  );

  // 4) Business validation: when results exist, terms should include the substring (case-insensitive)
  const allInclude = lower.data.every((e) =>
    e.term.toLowerCase().includes(queryLower),
  );
  TestValidator.predicate(
    "every matched record contains the query substring (or no results)",
    lower.data.length === 0 || allInclude,
  );

  // 5) Error test: query length below minimum (MinLength<2>) should be rejected
  await TestValidator.error(
    "reject one-character query by validation",
    async () => {
      await api.functional.communityPlatform.reservedTerms.index(connection, {
        body: {
          page: 1,
          limit: 5,
          query: "a", // violates MinLength<2>
          applies_to: derivedAppliesTo,
          active: true,
          sort_by: "created_at",
          sort_dir: "desc",
        } satisfies ICommunityPlatformReservedTerm.IRequest,
      });
    },
  );
}
