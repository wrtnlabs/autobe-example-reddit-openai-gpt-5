import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCategory";
import type { ICommunityPlatformComment } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformComment";
import type { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformPost } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformPost";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";
import type { IECategorySortBy } from "@ORGANIZATION/PROJECT-api/lib/structures/IECategorySortBy";
import type { IECommunityPlatformCommentSort } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformCommentSort";
import type { IESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IESortDirection";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformCategory";
import type { IPageICommunityPlatformComment } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformComment";

export async function test_api_comment_search_pagination_and_newest_ordering(
  connection: api.IConnection,
) {
  /**
   * Validate Newest ordering and stable pagination for comment search.
   *
   * Steps:
   *
   * 1. Join as community member (obtain session)
   * 2. List active categories and pick one
   * 3. Create a community bound to that category
   * 4. Create a post in the community
   * 5. Create 28 comments containing a unique token with the word "seoul"
   * 6. Search comments by that token and paginate (page 1 then next)
   *
   * Validations:
   *
   * - Page 1 contains exactly 20 items sorted by created_at desc
   * - Page 2 contains the remainder with no overlap vs page 1
   * - Combined (page1+page2) equals total records for the query (capped by 40)
   * - Combined ordering is non-increasing by created_at
   * - Requesting far beyond last page returns empty data
   */

  // 1) Authenticate as community member
  const joinOutput = await api.functional.auth.communityMember.join(
    connection,
    {
      body: {
        username: `user_${RandomGenerator.alphaNumeric(8)}`,
        email: typia.random<string & tags.Format<"email">>(),
        password: `${RandomGenerator.alphaNumeric(12)}`,
      } satisfies ICommunityPlatformCommunityMember.ICreate,
    },
  );
  typia.assert(joinOutput);

  // 2) Fetch an active category
  const categoriesPage =
    await api.functional.communityPlatform.categories.index(connection, {
      body: {
        active: true,
        limit: 50,
        sortBy: "display_order",
        direction: "asc",
      } satisfies ICommunityPlatformCategory.IRequest,
    });
  typia.assert(categoriesPage);
  TestValidator.predicate(
    "at least one active category exists",
    categoriesPage.data.length > 0,
  );
  const category = categoriesPage.data[0];
  typia.assert(category);

  // 3) Create a community under the category
  const community =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      {
        body: {
          name: `c${RandomGenerator.alphaNumeric(7)}`,
          community_platform_category_id: category.id,
          description: RandomGenerator.paragraph({ sentences: 8 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);

  // 4) Create a post in the community
  const post =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      {
        communityId: community.id,
        body: {
          title: RandomGenerator.name(3),
          body: RandomGenerator.content({
            paragraphs: 1,
            sentenceMin: 10,
            sentenceMax: 15,
          }),
          author_display_name: RandomGenerator.name(1),
        } satisfies ICommunityPlatformPost.ICreate,
      },
    );
  typia.assert(post);

  // 5) Create > 25 comments containing a unique token with the word "seoul"
  const createCount = 28;
  const keyword = `seoul-${RandomGenerator.alphaNumeric(8)}`;
  const createdComments: ICommunityPlatformComment[] = [];
  for (let i = 0; i < createCount; i++) {
    const comment =
      await api.functional.communityPlatform.communityMember.posts.comments.create(
        connection,
        {
          postId: post.id,
          body: {
            content: `Comment #${i + 1} for ${keyword}. This line ensures the token remains searchable in seoul context.`,
          } satisfies ICommunityPlatformComment.ICreate,
        },
      );
    typia.assert(comment);
    createdComments.push(comment);
  }
  TestValidator.equals(
    "created comment count",
    createdComments.length,
    createCount,
  );

  // Helper: check non-increasing created_at order
  const isNonIncreasingCreatedAt = (arr: { created_at: string }[]) =>
    arr.every((v, idx) => idx === 0 || arr[idx - 1].created_at >= v.created_at);

  // 6) Execute search page 1 (explicit limit=20; omit page to use default start)
  const page1 = await api.functional.communityPlatform.search.comments.index(
    connection,
    {
      body: {
        query: keyword,
        post_id: post.id,
        limit: 20,
      } satisfies ICommunityPlatformComment.IRequest,
    },
  );
  typia.assert(page1);

  // Validate page 1 size and ordering
  TestValidator.equals("page1 size is 20", page1.data.length, 20);
  TestValidator.predicate(
    "page1 ordered by created_at desc",
    isNonIncreasingCreatedAt(page1.data),
  );
  // Validate results belong to the intended post
  TestValidator.predicate(
    "page1 items belong to target post",
    page1.data.every((c) => c.community_platform_post_id === post.id),
  );
  // Records should match what we created for this unique token
  TestValidator.equals(
    "total records match created count",
    page1.pagination.records,
    createCount,
  );

  // Request page 2 using pagination.current + 1 (no assumption about indexing)
  const nextPageIndex = page1.pagination.current + 1;
  const page2 = await api.functional.communityPlatform.search.comments.index(
    connection,
    {
      body: {
        query: keyword,
        post_id: post.id,
        limit: 20,
        page: nextPageIndex,
      } satisfies ICommunityPlatformComment.IRequest,
    },
  );
  typia.assert(page2);

  // Validate page 2 size equals remaining (bounded by 20)
  const remainingAfterPage1 = Math.max(0, page1.pagination.records - 20);
  const expectedPage2 = remainingAfterPage1 > 20 ? 20 : remainingAfterPage1;
  TestValidator.equals(
    "page2 size equals remaining after page1",
    page2.data.length,
    expectedPage2,
  );
  TestValidator.predicate(
    "page2 ordered by created_at desc",
    isNonIncreasingCreatedAt(page2.data),
  );
  TestValidator.predicate(
    "page2 items belong to target post",
    page2.data.every((c) => c.community_platform_post_id === post.id),
  );

  // Ensure no overlap between page1 and page2
  const ids1 = new Set(page1.data.map((x) => x.id));
  const ids2 = new Set(page2.data.map((x) => x.id));
  const hasOverlap = [...ids1].some((id) => ids2.has(id));
  TestValidator.predicate("no overlap between page1 and page2", !hasOverlap);

  // Combined validations
  const combined = [...page1.data, ...page2.data];
  TestValidator.equals(
    "combined result count equals total records (capped by 40)",
    combined.length,
    Math.min(page1.pagination.records, 40),
  );
  TestValidator.predicate(
    "combined ordered by created_at desc",
    isNonIncreasingCreatedAt(combined),
  );

  // Cross-page order boundary: last of page1 >= first of page2 (when page2 not empty)
  if (page2.data.length > 0) {
    const lastOfPage1 = page1.data[page1.data.length - 1];
    const firstOfPage2 = page2.data[0];
    TestValidator.predicate(
      "page boundary ordering maintained",
      lastOfPage1.created_at >= firstOfPage2.created_at,
    );
  }

  // Edge case: request beyond last page -> empty data
  const farBeyond = page2.pagination.pages + 10;
  const pageBeyond =
    await api.functional.communityPlatform.search.comments.index(connection, {
      body: {
        query: keyword,
        post_id: post.id,
        limit: 20,
        page: farBeyond,
      } satisfies ICommunityPlatformComment.IRequest,
    });
  typia.assert(pageBeyond);
  TestValidator.equals("beyond last page is empty", pageBeyond.data.length, 0);
}
