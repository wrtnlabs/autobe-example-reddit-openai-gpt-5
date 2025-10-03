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
 * Community discovery: category filter and recentlyCreated ordering.
 *
 * Purpose
 *
 * - Verify that the discovery endpoint filters communities by a selected category
 *   and orders results by recently created (createdAt DESC, id DESC) when
 *   requested.
 * - Validate mutual exclusion across categories and empty-result behavior with a
 *   non-matching query.
 *
 * Pre-conditions
 *
 * - Authenticate as a registered member to create test communities.
 * - Create multiple communities in two categories so that filtering is meaningful
 *   and page size limits can be exercised.
 *
 * Steps
 *
 * 1. Join as a registered member (SDK manages token automatically).
 * 2. Create communities in categories "Tech & Programming" and "Sports" with
 *    unique, pattern-compliant names.
 * 3. Discover with category = "Tech & Programming", sort = "recentlyCreated",
 *    limit = 20. Assert:
 *
 *    - All items have category exactly matching the filter.
 *    - Ordering is (createdAt DESC, id DESC).
 *    - Page size does not exceed requested limit; pagination.limit echoes 20.
 * 4. Repeat discovery with category = "Sports" and assert category equality and
 *    ordering.
 * 5. Issue an empty-result query: provide a valid category plus a random q with
 *    length >= 2 that is unlikely to match anything; expect empty data array.
 */
export async function test_api_community_discovery_category_filter(
  connection: api.IConnection,
) {
  // 1) Join as a registered member
  const authorized = await api.functional.auth.registeredMember.join(
    connection,
    {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        username: `user_${RandomGenerator.alphaNumeric(10)}`,
        password: `P@ss_${RandomGenerator.alphaNumeric(12)}`,
        displayName: RandomGenerator.name(),
      } satisfies ICommunityPlatformRegisteredMember.IJoin,
    },
  );
  typia.assert(authorized);

  // Helper to create a unique, pattern-compliant community name
  const nameOf = (prefix: string, idx: number): string =>
    `${prefix}_${RandomGenerator.alphaNumeric(8)}_${idx}`;

  // 2) Create communities in two categories
  const TECH: IECommunityCategory = "Tech & Programming";
  const SPORTS: IECommunityCategory = "Sports";

  const TECH_COUNT = 23; // > 20 to exercise limit-bound page size
  const SPORTS_COUNT = 7;

  const createCommunity = async (
    category: IECommunityCategory,
    namePrefix: string,
    index: number,
  ): Promise<ICommunityPlatformCommunity> => {
    const body = {
      name: nameOf(namePrefix, index),
      category,
      description: RandomGenerator.paragraph({ sentences: 8 }),
    } satisfies ICommunityPlatformCommunity.ICreate;

    const created =
      await api.functional.communityPlatform.registeredMember.communities.create(
        connection,
        { body },
      );
    typia.assert(created);
    return created;
  };

  const techCreated: ICommunityPlatformCommunity[] =
    await ArrayUtil.asyncRepeat(
      TECH_COUNT,
      async (i) => await createCommunity(TECH, "tech", i + 1),
    );
  const sportsCreated: ICommunityPlatformCommunity[] =
    await ArrayUtil.asyncRepeat(
      SPORTS_COUNT,
      async (i) => await createCommunity(SPORTS, "sports", i + 1),
    );
  // Type-validate local arrays
  typia.assert<ICommunityPlatformCommunity[]>(techCreated);
  typia.assert<ICommunityPlatformCommunity[]>(sportsCreated);

  // Utility: verify recentlyCreated ordering (createdAt DESC, then id DESC)
  const assertRecentlyCreatedOrder = (
    title: string,
    list: ICommunityPlatformCommunity.ISummary[],
  ) => {
    const ordered = list.every((curr, idx, arr) => {
      if (idx === 0) return true;
      const prev = arr[idx - 1];
      const prevAt = new Date(prev.createdAt).getTime();
      const currAt = new Date(curr.createdAt).getTime();
      // Non-increasing createdAt, and if equal, id must be DESC
      return currAt <= prevAt && (currAt !== prevAt || curr.id <= prev.id);
    });
    TestValidator.predicate(title, ordered);
  };

  // 3) Discover TECH with recentlyCreated
  const pageTech = await api.functional.communityPlatform.communities.index(
    connection,
    {
      body: {
        category: TECH,
        sort: "recentlyCreated",
        limit: 20,
      } satisfies ICommunityPlatformCommunity.IRequest,
    },
  );
  typia.assert(pageTech);

  // Category filter validation
  TestValidator.predicate(
    "all returned items match TECH category",
    pageTech.data.every((c) => c.category === TECH),
  );
  // Limit-bound size and echo
  TestValidator.predicate(
    "pageTech size does not exceed requested limit",
    pageTech.data.length <= 20,
  );
  TestValidator.equals(
    "pageTech.pagination.limit echoes request limit",
    pageTech.pagination.limit,
    20,
  );
  // Ordering validation
  assertRecentlyCreatedOrder(
    "pageTech ordered by createdAt DESC then id DESC",
    pageTech.data,
  );

  // 4) Discover SPORTS with recentlyCreated
  const pageSports = await api.functional.communityPlatform.communities.index(
    connection,
    {
      body: {
        category: SPORTS,
        sort: "recentlyCreated",
        limit: 20,
      } satisfies ICommunityPlatformCommunity.IRequest,
    },
  );
  typia.assert(pageSports);

  TestValidator.predicate(
    "all returned items match SPORTS category",
    pageSports.data.every((c) => c.category === SPORTS),
  );
  TestValidator.predicate(
    "pageSports size does not exceed requested limit",
    pageSports.data.length <= 20,
  );
  TestValidator.equals(
    "pageSports.pagination.limit echoes request limit",
    pageSports.pagination.limit,
    20,
  );
  assertRecentlyCreatedOrder(
    "pageSports ordered by createdAt DESC then id DESC",
    pageSports.data,
  );

  // 5) Empty-result query using a highly unlikely term (q >= 2)
  const improbableQ = `zz_${RandomGenerator.alphaNumeric(24)}`;
  const pageEmpty = await api.functional.communityPlatform.communities.index(
    connection,
    {
      body: {
        category: TECH,
        sort: "recentlyCreated",
        q: improbableQ,
        limit: 20,
      } satisfies ICommunityPlatformCommunity.IRequest,
    },
  );
  typia.assert(pageEmpty);
  TestValidator.equals(
    "empty-result query returns zero items",
    pageEmpty.data.length,
    0,
  );
}
