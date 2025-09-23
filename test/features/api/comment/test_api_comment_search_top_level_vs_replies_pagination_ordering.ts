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

/**
 * Validate comment search: top-level vs replies filtering, Newest ordering, and
 * pagination.
 *
 * Workflow:
 *
 * 1. Join as communityMember
 * 2. Discover an active category and create a community
 * 3. Create a post
 * 4. Create multiple top-level comments and replies containing the token "Orion"
 * 5. Search top-level comments only with page size 3, validate order and
 *    pagination across two pages
 * 6. Search replies by parent_id, validate filtering and Newest order
 */
export async function test_api_comment_search_top_level_vs_replies_pagination_ordering(
  connection: api.IConnection,
) {
  // Common search token to embed in comments
  const token = "Orion";

  // 1) Authentication: register as communityMember
  const username = `user_${RandomGenerator.alphaNumeric(8)}`;
  const memberAuth = await api.functional.auth.communityMember.join(
    connection,
    {
      body: {
        username,
        email: typia.random<string & tags.Format<"email">>(),
        password: `${RandomGenerator.alphaNumeric(12)}`,
      } satisfies ICommunityPlatformCommunityMember.ICreate,
    },
  );
  typia.assert(memberAuth);

  // 2) Discover an active category for community creation
  const catPage = await api.functional.communityPlatform.categories.index(
    connection,
    {
      body: {
        active: true,
        limit: 1,
        sortBy: "created_at",
        direction: "desc",
      } satisfies ICommunityPlatformCategory.IRequest,
    },
  );
  typia.assert(catPage);
  TestValidator.predicate(
    "at least one active category must exist",
    catPage.data.length >= 1,
  );
  const category = catPage.data[0];

  // 3) Create a community
  const communityName = `orion${RandomGenerator.alphaNumeric(8)}`; // starts with letter, ends alnum
  const community =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      {
        body: {
          name: communityName,
          community_platform_category_id: category.id,
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
          title: `${token} ${RandomGenerator.paragraph({ sentences: 3, wordMin: 4, wordMax: 8 })}`,
          body: RandomGenerator.content({
            paragraphs: 2,
            sentenceMin: 8,
            sentenceMax: 12,
            wordMin: 3,
            wordMax: 8,
          }),
        } satisfies ICommunityPlatformPost.ICreate,
      },
    );
  typia.assert(post);

  // 5) Create multiple top-level comments containing the token
  const topLevelCount = 5; // ensure > limit(3)
  const topLevels: ICommunityPlatformComment[] = await ArrayUtil.asyncRepeat(
    topLevelCount,
    async (i) => {
      const comment =
        await api.functional.communityPlatform.communityMember.posts.comments.create(
          connection,
          {
            postId: post.id,
            body: {
              content: `${token} - ${RandomGenerator.paragraph({ sentences: 6, wordMin: 3, wordMax: 8 })} [${i}]`,
            } satisfies ICommunityPlatformComment.ICreate,
          },
        );
      typia.assert(comment);
      return comment;
    },
  );

  // Create replies under the first top-level comment, also containing the token
  const parent = topLevels[0];
  const replyCount = 3;
  const replies: ICommunityPlatformComment[] = await ArrayUtil.asyncRepeat(
    replyCount,
    async (i) => {
      const reply =
        await api.functional.communityPlatform.communityMember.comments.replies.create(
          connection,
          {
            commentId: parent.id,
            body: {
              content: `${token} reply ${RandomGenerator.paragraph({ sentences: 4, wordMin: 3, wordMax: 8 })} [r${i}]`,
              parent_id: parent.id,
            } satisfies ICommunityPlatformComment.ICreate,
          },
        );
      typia.assert(reply);
      return reply;
    },
  );
  TestValidator.predicate(
    "replies created count matches",
    replies.length === replyCount,
  );

  // Helper: sort by Newest (created_at desc, then id desc) for expected ordering
  const sortNewest = (
    a: ICommunityPlatformComment,
    b: ICommunityPlatformComment,
  ) => {
    if (a.created_at === b.created_at)
      return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
    return a.created_at < b.created_at ? 1 : -1;
  };

  // Expected ordering for top-level comments
  const expectedTopSorted = [...topLevels].sort(sortNewest);

  // 6) Execute search (top-level only), page 0
  const pageSize = 3;
  const page0 = await api.functional.communityPlatform.comments.index(
    connection,
    {
      body: {
        query: token,
        post_id: post.id,
        top_level_only: true,
        page: 0,
        limit: pageSize,
        sort: "Newest",
      } satisfies ICommunityPlatformComment.IRequest,
    },
  );
  typia.assert(page0);

  // Validate only top-level, ordering, and expected IDs for page 0
  const onlyTop0 = page0.data.every(
    (c) => c.parent_id === null || c.parent_id === undefined,
  );
  TestValidator.predicate("page 0 returns only top-level comments", onlyTop0);
  const ordered0 = page0.data.every((c, i, arr) =>
    i === 0 ? true : arr[i - 1].created_at >= c.created_at,
  );
  TestValidator.predicate(
    "page 0 is ordered by Newest (created_at desc)",
    ordered0,
  );

  const expectedIds0 = expectedTopSorted.slice(0, pageSize).map((c) => c.id);
  const actualIds0 = page0.data.map((c) => c.id);
  TestValidator.equals(
    "page 0 IDs match expected newest slice",
    actualIds0,
    expectedIds0,
  );

  // 7) Fetch next page (page 1) and validate
  const page1 = await api.functional.communityPlatform.comments.index(
    connection,
    {
      body: {
        query: token,
        post_id: post.id,
        top_level_only: true,
        page: 1,
        limit: pageSize,
        sort: "Newest",
      } satisfies ICommunityPlatformComment.IRequest,
    },
  );
  typia.assert(page1);
  const onlyTop1 = page1.data.every(
    (c) => c.parent_id === null || c.parent_id === undefined,
  );
  TestValidator.predicate("page 1 returns only top-level comments", onlyTop1);
  const ordered1 = page1.data.every((c, i, arr) =>
    i === 0 ? true : arr[i - 1].created_at >= c.created_at,
  );
  TestValidator.predicate(
    "page 1 is ordered by Newest (created_at desc)",
    ordered1,
  );

  const expectedIds1 = expectedTopSorted
    .slice(pageSize, pageSize * 2)
    .map((c) => c.id);
  const actualIds1 = page1.data.map((c) => c.id);
  TestValidator.equals(
    "page 1 IDs match expected slice",
    actualIds1,
    expectedIds1,
  );

  // Ensure no duplicates across pages
  const set0 = new Set(actualIds0);
  const dupAcrossPages = actualIds1.some((id) => set0.has(id));
  TestValidator.predicate(
    "no duplicate IDs across page 0 and page 1",
    !dupAcrossPages,
  );

  // Pagination metadata indicates at least two pages when we created 5 items and limit=3
  TestValidator.predicate(
    "pagination pages should be >= 2",
    page0.pagination.pages >= 2,
  );

  // 8) Replies filter: parent-specific search
  const repliesPage = await api.functional.communityPlatform.comments.index(
    connection,
    {
      body: {
        parent_id: parent.id,
        post_id: post.id,
        query: token,
        limit: 10,
        sort: "Newest",
        page: 0,
      } satisfies ICommunityPlatformComment.IRequest,
    },
  );
  typia.assert(repliesPage);

  // Validate all items are replies of the chosen parent
  const allChildOfParent = repliesPage.data.every(
    (c) => c.parent_id === parent.id,
  );
  TestValidator.predicate(
    "replies search returns only children of the parent",
    allChildOfParent,
  );

  // Validate Newest ordering for replies
  const repliesOrdered = repliesPage.data.every((c, i, arr) =>
    i === 0 ? true : arr[i - 1].created_at >= c.created_at,
  );
  TestValidator.predicate(
    "replies are ordered by Newest (created_at desc)",
    repliesOrdered,
  );

  // Expected ordering for created replies
  const expectedRepliesSorted = [...replies].sort(sortNewest).map((c) => c.id);
  const actualRepliesIds = repliesPage.data.map((c) => c.id);
  TestValidator.equals(
    "replies IDs match expected newest order",
    actualRepliesIds,
    expectedRepliesSorted,
  );
}
