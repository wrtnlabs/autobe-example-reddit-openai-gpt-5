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

export async function test_api_community_discovery_recently_created_pagination(
  connection: api.IConnection,
) {
  /**
   * Community discovery: recentlyCreated sorting and pagination.
   *
   * Steps:
   *
   * 1. Register a new member to obtain authenticated session (for setup only).
   * 2. Create 26 communities with a unique name prefix across at least two
   *    categories.
   * 3. Using an unauthenticated connection clone, call discovery with { q: prefix,
   *    sort: "recentlyCreated", limit: 20 } and validate:
   *
   *    - Exactly 20 items returned
   *    - Sorting is createdAt DESC, then id DESC for ties
   *    - Spot-check memberCount is >= 0 for each summary
   * 4. Call discovery again with a larger limit (100) and validate:
   *
   *    - Pagination metadata consistency (pages = ceil(records / limit))
   *    - Deterministic ordering: first-page IDs match the first 20 IDs from the full
   *         list
   */

  // 1) Register a new member (authentication for setup)
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    username: RandomGenerator.name(1),
    password: RandomGenerator.alphaNumeric(12),
    displayName: RandomGenerator.name(2),
  } satisfies ICommunityPlatformRegisteredMember.IJoin;
  const authorized: ICommunityPlatformRegisteredMember.IAuthorized =
    await api.functional.auth.registeredMember.join(connection, {
      body: joinBody,
    });
  typia.assert(authorized);

  // 2) Create many communities with a unique, searchable prefix
  const token: string = RandomGenerator.alphaNumeric(8);
  const prefix: string = `t${token}`; // starts with alphanumeric
  const CATEGORIES = [
    "Tech & Programming",
    "Science",
    "Movies & TV",
    "Games",
    "Sports",
    "Lifestyle & Wellness",
    "Study & Education",
    "Art & Design",
    "Business & Finance",
    "News & Current Affairs",
  ] as const;
  const COUNT = 26; // > 25 to ensure full first page (20) and remaining

  const created = await ArrayUtil.asyncRepeat(COUNT, async (i) => {
    const name: string = `${prefix}-${i}-${RandomGenerator.alphaNumeric(3)}`; // pattern-safe, <= 30 chars
    const category = CATEGORIES[i % CATEGORIES.length];
    const body = {
      name,
      category,
      description: RandomGenerator.paragraph({ sentences: 8 }),
    } satisfies ICommunityPlatformCommunity.ICreate;

    const community: ICommunityPlatformCommunity =
      await api.functional.communityPlatform.registeredMember.communities.create(
        connection,
        { body },
      );
    typia.assert(community);
    return community;
  });
  typia.assert(created);

  // Prepare an unauthenticated connection for public discovery calls
  const publicConn: api.IConnection = { ...connection, headers: {} };

  // Helper: check ordering (createdAt DESC, id DESC for ties)
  const isSortedDesc = (
    rows: ICommunityPlatformCommunity.ISummary[],
  ): boolean => {
    for (let i = 1; i < rows.length; ++i) {
      const a = rows[i - 1];
      const b = rows[i];
      // primary: createdAt DESC (ISO string comparable)
      if (a.createdAt !== b.createdAt) {
        if (a.createdAt < b.createdAt) return false; // not DESC
      } else {
        // tie: id DESC (lexicographical)
        if (a.id < b.id) return false;
      }
    }
    return true;
  };

  // 3) First page: limit 20, sort recentlyCreated
  const firstPage = await api.functional.communityPlatform.communities.index(
    publicConn,
    {
      body: {
        q: prefix,
        sort: "recentlyCreated",
        limit: 20 as number &
          tags.Type<"int32"> &
          tags.Minimum<1> &
          tags.Maximum<100>,
      } satisfies ICommunityPlatformCommunity.IRequest,
    },
  );
  typia.assert(firstPage);

  TestValidator.equals(
    "first page returns exactly 20 items",
    firstPage.data.length,
    Math.min(20, COUNT),
  );
  TestValidator.equals(
    "first page limit echoes 20",
    firstPage.pagination.limit,
    20,
  );
  await TestValidator.predicate(
    "first page items are sorted by createdAt DESC then id DESC",
    async () => isSortedDesc(firstPage.data),
  );
  await ArrayUtil.asyncForEach(firstPage.data, async (row, idx) => {
    // memberCount must be >= 0
    TestValidator.predicate(
      `memberCount non-negative at index ${idx}`,
      (row.memberCount ?? 0) >= 0,
    );
  });

  // 4) Full list (fetch all using larger limit) for deterministic comparison
  const fullList = await api.functional.communityPlatform.communities.index(
    publicConn,
    {
      body: {
        q: prefix,
        sort: "recentlyCreated",
        limit: 100 as number &
          tags.Type<"int32"> &
          tags.Minimum<1> &
          tags.Maximum<100>,
      } satisfies ICommunityPlatformCommunity.IRequest,
    },
  );
  typia.assert(fullList);

  // Validate pagination math: pages == ceil(records / limit)
  const expectedPages = Math.ceil(
    (fullList.pagination.records as number) /
      (fullList.pagination.limit as number),
  );
  TestValidator.equals(
    "pages equals ceil(records/limit) on full list",
    fullList.pagination.pages,
    expectedPages,
  );

  // Validate ordering and that first page equals prefix of full list
  await TestValidator.predicate(
    "full list sorted by createdAt DESC then id DESC",
    async () => isSortedDesc(fullList.data),
  );

  const first20Ids = firstPage.data.map((r) => r.id);
  const fullFirst20Ids = fullList.data.slice(0, 20).map((r) => r.id);
  TestValidator.equals(
    "first page IDs equal first 20 IDs of full list",
    first20Ids,
    fullFirst20Ids,
  );
}
