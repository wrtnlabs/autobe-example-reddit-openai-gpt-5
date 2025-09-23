import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCategory";
import type { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformPost } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformPost";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";
import type { IECategorySortBy } from "@ORGANIZATION/PROJECT-api/lib/structures/IECategorySortBy";
import type { IESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IESortDirection";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformCategory";
import type { IPageICommunityPlatformPost } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformPost";

/**
 * Validate Newest order and pagination for community posts index.
 *
 * Workflow:
 *
 * 1. Join as communityMember (auth) to enable data creation flows
 * 2. Discover an active category (for community creation)
 * 3. Create a community under the discovered category
 * 4. Seed multiple posts in that community
 * 5. Query posts index with sort=newest and small limit to validate ordering and
 *    pagination
 * 6. Edge: create an extra post after first page retrieval, then fetch page 2 and
 *    ensure no duplicates
 */
export async function test_api_post_search_newest_order_and_pagination(
  connection: api.IConnection,
) {
  // 1) Authenticate as communityMember
  const authorized = await api.functional.auth.communityMember.join(
    connection,
    {
      body: {
        username: RandomGenerator.alphabets(8),
        email: typia.random<string & tags.Format<"email">>(),
        password: `P${RandomGenerator.alphaNumeric(11)}`,
      } satisfies ICommunityPlatformCommunityMember.ICreate,
    },
  );
  typia.assert(authorized);

  // 2) Discover an active category
  const categoryPage = await api.functional.communityPlatform.categories.index(
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
  typia.assert(categoryPage);
  TestValidator.predicate(
    "at least one active category exists",
    categoryPage.data.length > 0,
  );
  const category = categoryPage.data[0];

  // 3) Create a community
  const slug = `c${RandomGenerator.alphaNumeric(9)}`; // starts with a letter, length 10
  const community =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      {
        body: {
          name: slug,
          community_platform_category_id: category.id,
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);

  // 4) Seed multiple posts (>= 5)
  const seedCount = 7;
  const seededPosts: ICommunityPlatformPost[] = await ArrayUtil.asyncRepeat(
    seedCount,
    async () => {
      const post =
        await api.functional.communityPlatform.communityMember.communities.posts.create(
          connection,
          {
            communityId: community.id,
            body: {
              title: RandomGenerator.paragraph({ sentences: 5 }),
              body: RandomGenerator.content({
                paragraphs: 1,
                sentenceMin: 10,
                sentenceMax: 20,
              }),
              author_display_name: RandomGenerator.name(1),
            } satisfies ICommunityPlatformPost.ICreate,
          },
        );
      typia.assert(post);
      return post;
    },
  );
  TestValidator.predicate(
    "seeded posts count should match",
    seededPosts.length === seedCount,
  );

  // Local comparator for deterministic Newest order: created_at desc, then id desc
  const byNewest = (
    a: ICommunityPlatformPost.ISummary | ICommunityPlatformPost,
    b: ICommunityPlatformPost.ISummary | ICommunityPlatformPost,
  ) => {
    const t = (b.created_at as string).localeCompare(a.created_at as string);
    return t !== 0 ? t : (b.id as string).localeCompare(a.id as string);
  };

  // Compute newest among initially seeded posts (for first page expectation)
  const seededNewestFirst = [...seededPosts].sort(byNewest);

  // 5) Query page 1 with small limit to force pagination
  const limit = 3;
  const page1 = await api.functional.communityPlatform.posts.index(connection, {
    body: {
      page: 1,
      limit,
      sort: "newest",
      community_id: community.id,
    } satisfies ICommunityPlatformPost.IRequest,
  });
  typia.assert(page1);

  // Basic pagination metadata checks
  TestValidator.equals("page1 current page", page1.pagination.current, 1);
  TestValidator.equals(
    "page1 limit equals request limit",
    page1.pagination.limit,
    limit,
  );
  TestValidator.predicate("page1 has items", page1.data.length > 0);

  // Verify page1 ordering equals Newest with deterministic tie-breakers
  const sortedCopy1 = [...page1.data].sort(byNewest);
  TestValidator.equals(
    "page1 items are sorted by created_at desc then id desc",
    page1.data,
    sortedCopy1,
  );

  // Verify the very first item is the newest among the initially seeded posts
  const expectedFirstId = seededNewestFirst[0]?.id;
  const actualFirstId = page1.data[0]?.id;
  TestValidator.equals(
    "first item on page1 equals newest seeded post before extra creation",
    actualFirstId,
    expectedFirstId,
  );

  // 6) Edge case: create an additional post after first page retrieval
  const extraPost =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      {
        communityId: community.id,
        body: {
          title: RandomGenerator.paragraph({ sentences: 6 }),
          body: RandomGenerator.content({
            paragraphs: 1,
            sentenceMin: 10,
            sentenceMax: 20,
          }),
          author_display_name: RandomGenerator.name(1),
        } satisfies ICommunityPlatformPost.ICreate,
      },
    );
  typia.assert(extraPost);

  // Fetch page 2 and ensure no duplicates with page 1
  const page2 = await api.functional.communityPlatform.posts.index(connection, {
    body: {
      page: 2,
      limit,
      sort: "newest",
      community_id: community.id,
    } satisfies ICommunityPlatformPost.IRequest,
  });
  typia.assert(page2);

  TestValidator.equals("page2 current page", page2.pagination.current, 2);
  TestValidator.equals(
    "page2 limit equals request limit",
    page2.pagination.limit,
    limit,
  );

  // Validate sorting on page 2 as well
  const sortedCopy2 = [...page2.data].sort(byNewest);
  TestValidator.equals(
    "page2 items are sorted by created_at desc then id desc",
    page2.data,
    sortedCopy2,
  );

  // Ensure no duplicates across page1 and page2
  const page1Ids = new Set(page1.data.map((p) => p.id));
  const hasDuplicate = page2.data.some((p) => page1Ids.has(p.id));
  TestValidator.predicate(
    "no duplicates across page1 and page2",
    hasDuplicate === false,
  );
}
