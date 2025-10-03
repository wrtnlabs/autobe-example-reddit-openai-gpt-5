import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IClientContext } from "@ORGANIZATION/PROJECT-api/lib/structures/IClientContext";
import type { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";
import type { ICommunityPlatformCommunityRule } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityRule";
import type { ICommunityPlatformCommunityRuleArray } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityRuleArray";
import type { ICommunityPlatformRegisteredMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRegisteredMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";
import type { IECommunityCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityCategory";
import type { IECommunityPlatformCommunityCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformCommunityCategory";
import type { IECommunitySort } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunitySort";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformCommunity";

/**
 * Validate community search recentlyCreated sorting and page-size behavior.
 *
 * Business objective: ensure that community search ordered by recentlyCreated
 * returns results in deterministic order (createdAt DESC, id DESC) and that the
 * default page size (20) is applied when limit is omitted. Also validate that
 * retrieving a larger set with limit allows checking the complete ordering for
 * all created communities.
 *
 * Due to the response DTO (IPageICommunityPlatformCommunity.ISummary) not
 * exposing a cursor token, this test adapts by verifying the first page
 * (default 20) and then fetching all results with a higher limit to validate
 * global ordering. This aligns with the available API/DTO contracts while still
 * covering sorting logic comprehensively.
 *
 * Steps:
 *
 * 1. Register a fresh member (auth.registeredMember.join) – SDK stores token.
 * 2. Create 25 communities with a unique common prefix to isolate search.
 * 3. Search with sort=recentlyCreated and q=prefix (limit omitted -> default 20).
 *
 *    - Validate page size=20 and ordering equals top-20 of expected order.
 *    - Independently check monotonic non-increasing createdAt and id DESC
 *         tie-breaker.
 * 4. Search again with limit=100 to obtain all created communities.
 *
 *    - Validate count=25 and full ordering equality.
 */
export async function test_api_communities_search_recently_created_sort_and_pagination(
  connection: api.IConnection,
) {
  // 1) Register a fresh member
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const username: string = `user_${RandomGenerator.alphaNumeric(8)}`;
  const password: string = `P@ssw0rd-${RandomGenerator.alphaNumeric(8)}`;

  const authorized = await api.functional.auth.registeredMember.join(
    connection,
    {
      body: {
        email,
        username,
        password,
        client: {
          userAgent: "e2e/community-search",
          clientPlatform: "node-e2e",
          clientDevice: "ci",
          sessionType: "standard",
        },
      } satisfies ICommunityPlatformRegisteredMember.IJoin,
    },
  );
  typia.assert(authorized);

  // 2) Create 25 communities with a unique prefix
  const prefix: string = `qa${RandomGenerator.alphaNumeric(6)}`; // q>=2 guaranteed
  const category: IECommunityCategory = "Tech & Programming";

  const created: ICommunityPlatformCommunity[] = await ArrayUtil.asyncRepeat(
    25,
    async (index) => {
      const name = `${prefix}-${(index + 1).toString().padStart(2, "0")}`;
      const community =
        await api.functional.communityPlatform.registeredMember.communities.create(
          connection,
          {
            body: {
              name,
              category,
              description: RandomGenerator.paragraph({ sentences: 8 }),
            } satisfies ICommunityPlatformCommunity.ICreate,
          },
        );
      typia.assert(community);
      return community;
    },
  );

  // Build expected deterministic order: createdAt DESC, then id DESC
  const expectedSorted: ICommunityPlatformCommunity[] = [...created].sort(
    (a, b) => {
      if (a.createdAt < b.createdAt) return 1; // DESC
      if (a.createdAt > b.createdAt) return -1;
      // tie-breaker: id DESC
      return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
    },
  );

  // 3) Search first page (limit omitted -> default 20)
  const page1 = await api.functional.communityPlatform.search.communities.index(
    connection,
    {
      body: {
        q: prefix, // ensure at least 2 characters
        sort: "recentlyCreated",
      } satisfies ICommunityPlatformCommunity.IRequest,
    },
  );
  typia.assert(page1);

  // Validate default page size and returned count
  TestValidator.equals(
    "default pagination limit should be 20",
    page1.pagination.limit,
    20,
  );
  TestValidator.equals(
    "first page should return 20 items",
    page1.data.length,
    20,
  );

  // Validate that all names have the expected prefix (isolation)
  TestValidator.predicate(
    "all items on page1 should start with the unique prefix",
    page1.data.every((s) => s.name.startsWith(prefix)),
  );

  // Validate exact ordering of first page against expected top-20
  const expectedIdsPage1: string[] = expectedSorted
    .slice(0, 20)
    .map((x) => x.id);
  const actualIdsPage1: string[] = page1.data.map((x) => x.id);
  TestValidator.equals(
    "page1 IDs must equal top-20 expected order (createdAt DESC, id DESC)",
    actualIdsPage1,
    expectedIdsPage1,
  );

  // Independent monotonicity check on page1 (createdAt DESC, then id DESC)
  const isPage1Sorted = page1.data.every((curr, i, arr) => {
    if (i === 0) return true;
    const prev = arr[i - 1];
    if (prev.createdAt < curr.createdAt) return false; // must be non-increasing
    if (prev.createdAt === curr.createdAt && prev.id < curr.id) return false; // tie: id DESC
    return true;
  });
  TestValidator.predicate(
    "page1 is sorted by createdAt DESC with id DESC tie-breaker",
    isPage1Sorted,
  );

  // 4) Fetch all with higher limit to validate complete ordering (no cursor in DTO)
  const all = await api.functional.communityPlatform.search.communities.index(
    connection,
    {
      body: {
        q: prefix,
        sort: "recentlyCreated",
        limit: 100, // within Maximum<100>
      } satisfies ICommunityPlatformCommunity.IRequest,
    },
  );
  typia.assert(all);

  // Count should include exactly our 25 created items for the unique prefix
  TestValidator.equals(
    "full fetch should return exactly the 25 created communities",
    all.data.length,
    25,
  );

  // Global exact ordering check
  const expectedAllIds: string[] = expectedSorted.map((x) => x.id);
  const actualAllIds: string[] = all.data.map((x) => x.id);
  TestValidator.equals(
    "all IDs must equal expected order (createdAt DESC, id DESC)",
    actualAllIds,
    expectedAllIds,
  );

  // Isolation check for all results
  TestValidator.predicate(
    "all items in full fetch start with the unique prefix",
    all.data.every((s) => s.name.startsWith(prefix)),
  );
}
