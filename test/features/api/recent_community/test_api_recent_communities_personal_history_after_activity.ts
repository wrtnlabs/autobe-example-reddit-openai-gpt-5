import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCategory";
import type { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformPost } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformPost";
import type { ICommunityPlatformRecentCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRecentCommunity";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";
import type { IECategorySortBy } from "@ORGANIZATION/PROJECT-api/lib/structures/IECategorySortBy";
import type { IECommunityPlatformRecentCommunityOrderBy } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformRecentCommunityOrderBy";
import type { IESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IESortDirection";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformCategory";
import type { IPageICommunityPlatformRecentCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformRecentCommunity";

/**
 * Validate the personal recent communities list updates after activity.
 *
 * Business flow
 *
 * 1. Join as community member and capture userId
 * 2. Discover an active category via categories index
 * 3. Create Community A under the category
 * 4. Create Community B under the same category
 * 5. Post in A then post in B to ensure B is the most recent
 * 6. Retrieve recent communities with a recent from filter, order by
 *    last_activity_at desc
 *
 * Validations
 *
 * - Both A and B are included in the recent list
 * - B appears before A (most recent first)
 * - No duplicate communities
 * - Pagination shape is valid
 * - Each item includes nested community summary
 * - All items respect the from filter (last_activity_at >= from)
 * - Negative: invalid page (0) causes an error
 */
export async function test_api_recent_communities_personal_history_after_activity(
  connection: api.IConnection,
) {
  // 1) Join as a community member
  const member = await api.functional.auth.communityMember.join(connection, {
    body: {
      username: `user_${RandomGenerator.alphaNumeric(8)}`,
      email: typia.random<string & tags.Format<"email">>(),
      password: `${RandomGenerator.alphaNumeric(12)}${RandomGenerator.alphaNumeric(4)}`,
    } satisfies ICommunityPlatformCommunityMember.ICreate,
  });
  typia.assert(member);
  const userId = member.id;

  // 2) Discover an active category (fallback to general listing if empty)
  const catPage = await api.functional.communityPlatform.categories.index(
    connection,
    {
      body: {
        page: 1,
        limit: 20,
        active: true,
        sortBy: "display_order",
        direction: "asc",
      } satisfies ICommunityPlatformCategory.IRequest,
    },
  );
  typia.assert(catPage);
  const categories = catPage.data;

  let categoryId: string & tags.Format<"uuid">;
  if (categories.length === 0) {
    const fallback = await api.functional.communityPlatform.categories.index(
      connection,
      {
        body: {
          page: 1,
          limit: 20,
        } satisfies ICommunityPlatformCategory.IRequest,
      },
    );
    typia.assert(fallback);
    TestValidator.predicate(
      "category listing should not be empty",
      fallback.data.length > 0,
    );
    categoryId = fallback.data[0].id;
  } else categoryId = categories[0].id;

  // 3) Create Community A
  const baseSlug = `e2e-${RandomGenerator.alphaNumeric(8)}`;
  const communityA =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      {
        body: {
          name: `${baseSlug}-a`,
          community_platform_category_id: categoryId,
          description: RandomGenerator.paragraph({ sentences: 5 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(communityA);

  // 4) Create Community B
  const communityB =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      {
        body: {
          name: `${baseSlug}-b`,
          community_platform_category_id: categoryId,
          description: RandomGenerator.paragraph({ sentences: 5 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(communityB);

  // 5) Post in A then B to produce recency ordering
  const postA =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      {
        communityId: communityA.id,
        body: {
          title: RandomGenerator.paragraph({ sentences: 5 }),
          body: RandomGenerator.content({
            paragraphs: 1,
            sentenceMin: 10,
            sentenceMax: 20,
            wordMin: 3,
            wordMax: 8,
          }),
        } satisfies ICommunityPlatformPost.ICreate,
      },
    );
  typia.assert(postA);

  const postB =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      {
        communityId: communityB.id,
        body: {
          title: RandomGenerator.paragraph({ sentences: 5 }),
          body: RandomGenerator.content({
            paragraphs: 1,
            sentenceMin: 10,
            sentenceMax: 20,
            wordMin: 3,
            wordMax: 8,
          }),
        } satisfies ICommunityPlatformPost.ICreate,
      },
    );
  typia.assert(postB);

  // 6) Retrieve recent communities with a recent window filter and ordering
  const from = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const recents =
    await api.functional.communityPlatform.communityMember.users.recentCommunities.index(
      connection,
      {
        userId,
        body: {
          page: 1,
          limit: 50,
          orderBy: "last_activity_at",
          direction: "desc",
          from,
        } satisfies ICommunityPlatformRecentCommunity.IRequest,
      },
    );
  typia.assert(recents);

  // Ensure both communities are present
  const communityIds = recents.data.map((r) => r.community.id);
  const indexA = communityIds.indexOf(communityA.id);
  const indexB = communityIds.indexOf(communityB.id);
  TestValidator.predicate(
    "recent list should include Community A",
    indexA !== -1,
  );
  TestValidator.predicate(
    "recent list should include Community B",
    indexB !== -1,
  );

  // Most recent first: B before A
  TestValidator.predicate(
    "Community B should appear before Community A",
    indexB !== -1 && indexA !== -1 && indexB < indexA,
  );

  // No duplicate communities
  const uniqueCount = new Set(communityIds).size;
  TestValidator.equals(
    "no duplicate community entries on the page",
    communityIds.length,
    uniqueCount,
  );

  // Pagination sanity checks
  TestValidator.predicate(
    "pagination current is non-negative",
    recents.pagination.current >= 0,
  );
  TestValidator.predicate(
    "pagination limit is positive",
    recents.pagination.limit >= 1,
  );
  TestValidator.predicate(
    "total pages is at least 1",
    recents.pagination.pages >= 1,
  );
  TestValidator.predicate(
    "records should be >= returned data length",
    recents.pagination.records >= recents.data.length,
  );

  // Each record respects the from filter
  const fromMs = Date.parse(from);
  TestValidator.predicate(
    "all items have last_activity_at >= from",
    recents.data.every((r) => Date.parse(r.last_activity_at) >= fromMs),
  );

  // Basic structure for nested community summary is present
  TestValidator.predicate(
    "each item has a nested community summary",
    recents.data.every((it) => typeof it.community.id === "string"),
  );

  // Negative: malformed pagination (page = 0) should error
  await TestValidator.error("invalid pagination page must fail", async () => {
    await api.functional.communityPlatform.communityMember.users.recentCommunities.index(
      connection,
      {
        userId,
        body: {
          page: 0,
          limit: 10,
        } satisfies ICommunityPlatformRecentCommunity.IRequest,
      },
    );
  });
}
