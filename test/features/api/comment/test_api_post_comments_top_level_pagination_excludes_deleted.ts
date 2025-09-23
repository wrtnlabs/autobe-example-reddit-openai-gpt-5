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
 * Validate listing of top-level comments excludes deleted items and replies,
 * ordered by Newest, with stable pagination.
 *
 * Business flow:
 *
 * 1. Authenticate by joining as a communityMember.
 * 2. Discover an active category and create a community.
 * 3. Create a post in the community.
 * 4. Seed comments: create four top-level comments and one reply under the first
 *    comment.
 * 5. Soft-delete one of the top-level comments.
 * 6. List top-level comments with Newest sort and page=0, limit=2, then page=1,
 *    ensuring:
 *
 *    - Only non-deleted, top-level comments are returned (replies excluded).
 *    - Items ordered by created_at desc, tie-break by larger id.
 *    - Pagination is deterministic: page1 returns newest two, page2 returns the last
 *         remaining one.
 */
export async function test_api_post_comments_top_level_pagination_excludes_deleted(
  connection: api.IConnection,
) {
  // 1) Join as a new communityMember
  const member: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(connection, {
      body: {
        username: `user_${RandomGenerator.alphaNumeric(10)}`,
        email: typia.random<string & tags.Format<"email">>(),
        password: RandomGenerator.alphaNumeric(12),
      } satisfies ICommunityPlatformCommunityMember.ICreate,
    });
  typia.assert(member);

  // 2) Discover an active category
  const categories: IPageICommunityPlatformCategory.ISummary =
    await api.functional.communityPlatform.categories.index(connection, {
      body: {
        page: 1 satisfies number as number,
        limit: 5 satisfies number as number,
        active: true,
        sortBy: "display_order" as IECategorySortBy,
        direction: "asc" as IESortDirection,
      } satisfies ICommunityPlatformCategory.IRequest,
    });
  typia.assert(categories);
  await TestValidator.predicate(
    "at least one active category must exist",
    async () => categories.data.length > 0,
  );
  const categoryId = categories.data[0]!.id;

  // 3) Create a community (name conforms to pattern: starts with letter, ends with alphanumeric)
  const community: ICommunityPlatformCommunity =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      {
        body: {
          name: `c${RandomGenerator.alphabets(1)}_${RandomGenerator.alphaNumeric(6)}`,
          community_platform_category_id: categoryId,
          description: RandomGenerator.paragraph({ sentences: 6 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);

  // 4) Create a post in the community
  const post: ICommunityPlatformPost =
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
  typia.assert(post);

  // 5) Seed four top-level comments (no parent_id) to enable 2+1 pagination after deletion
  const c1: ICommunityPlatformComment =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      connection,
      {
        postId: post.id,
        body: {
          content: RandomGenerator.paragraph({ sentences: 8 }),
        } satisfies ICommunityPlatformComment.ICreate,
      },
    );
  typia.assert(c1);
  const c2: ICommunityPlatformComment =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      connection,
      {
        postId: post.id,
        body: {
          content: RandomGenerator.paragraph({ sentences: 8 }),
        } satisfies ICommunityPlatformComment.ICreate,
      },
    );
  typia.assert(c2);
  const c3: ICommunityPlatformComment =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      connection,
      {
        postId: post.id,
        body: {
          content: RandomGenerator.paragraph({ sentences: 8 }),
        } satisfies ICommunityPlatformComment.ICreate,
      },
    );
  typia.assert(c3);
  const c4: ICommunityPlatformComment =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      connection,
      {
        postId: post.id,
        body: {
          content: RandomGenerator.paragraph({ sentences: 8 }),
        } satisfies ICommunityPlatformComment.ICreate,
      },
    );
  typia.assert(c4);

  // Create a reply under the first top-level comment
  const r1: ICommunityPlatformComment =
    await api.functional.communityPlatform.communityMember.comments.replies.create(
      connection,
      {
        commentId: c1.id,
        body: {
          content: RandomGenerator.paragraph({ sentences: 6 }),
          parent_id: c1.id,
        } satisfies ICommunityPlatformComment.ICreate,
      },
    );
  typia.assert(r1);

  // 6) Soft-delete one top-level comment (c2) so 3 non-deleted remain
  await api.functional.communityPlatform.communityMember.comments.erase(
    connection,
    { commentId: c2.id },
  );

  // Helper: expected ordering (Newest with tiebreak by larger id)
  const cmpNewest = (
    a: ICommunityPlatformComment,
    b: ICommunityPlatformComment,
  ): number => {
    const da = new Date(a.created_at).getTime();
    const db = new Date(b.created_at).getTime();
    if (db !== da) return db - da; // newer first
    return b.id.localeCompare(a.id); // larger id first for tiebreak
  };

  const remainingTopLevels: ICommunityPlatformComment[] = [c1, c3, c4];
  const expectedOrdered = [...remainingTopLevels].sort(cmpNewest);

  // 7) List top-level comments, Newest, page=0, limit=2
  const page1: IPageICommunityPlatformComment =
    await api.functional.communityPlatform.posts.comments.index(connection, {
      postId: post.id,
      body: {
        page: 0 satisfies number as number,
        limit: 2 satisfies number as number,
        top_level_only: true,
        sort: "Newest" as IECommunityPlatformCommentSort,
      } satisfies ICommunityPlatformComment.IRequest,
    });
  typia.assert(page1);

  // Validate page1 basics: only top-level, not deleted, correct post, order matches expected top-2
  TestValidator.predicate(
    "page1 items are top-level, not deleted, and belong to the post",
    page1.data.every(
      (d) =>
        (d.parent_id === null || d.parent_id === undefined) &&
        d.id !== c2.id &&
        d.id !== r1.id &&
        d.community_platform_post_id === post.id,
    ),
  );
  const page1Ids = page1.data.map((d) => d.id);
  const expectedPage1Ids = expectedOrdered.slice(0, 2).map((x) => x.id);
  TestValidator.equals(
    "page1 ordering is Newest with deterministic tiebreak",
    page1Ids,
    expectedPage1Ids,
  );

  // 8) Next page (page=1) should contain the last remaining item
  const page2: IPageICommunityPlatformComment =
    await api.functional.communityPlatform.posts.comments.index(connection, {
      postId: post.id,
      body: {
        page: 1 satisfies number as number,
        limit: 2 satisfies number as number,
        top_level_only: true,
        sort: "Newest" as IECommunityPlatformCommentSort,
      } satisfies ICommunityPlatformComment.IRequest,
    });
  typia.assert(page2);

  TestValidator.predicate(
    "page2 items are top-level and not deleted",
    page2.data.every(
      (d) =>
        (d.parent_id === null || d.parent_id === undefined) &&
        d.id !== c2.id &&
        d.id !== r1.id &&
        d.community_platform_post_id === post.id,
    ),
  );
  const expectedPage2Ids = expectedOrdered.slice(2).map((x) => x.id);
  TestValidator.equals(
    "page2 contains the remaining one item",
    page2.data.map((d) => d.id),
    expectedPage2Ids,
  );
}
