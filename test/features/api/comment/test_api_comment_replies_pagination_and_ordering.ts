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

export async function test_api_comment_replies_pagination_and_ordering(
  connection: api.IConnection,
) {
  /**
   * Validate reply listing under a parent comment with pagination and Newest
   * ordering.
   *
   * Steps:
   *
   * 1. Join as a community member (User A).
   * 2. Discover a category (page 1, limit 1) to attach when creating a community.
   * 3. Create a community and a post within it.
   * 4. Create a top-level parent comment on the post.
   * 5. Create 25 reply comments under the parent.
   * 6. List replies with page 0 (limit 20) and page 1 (limit 20), sort Newest.
   * 7. Assert deterministic order (created_at desc, id desc), correct scoping
   *    (parent_id), and no cross-page overlap.
   */

  // 1) Authenticate User A
  const joinBody = {
    username: `user_${RandomGenerator.alphaNumeric(8)}`,
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const userA: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(connection, {
      body: joinBody,
    });
  typia.assert(userA);

  // 2) Discover a category for community creation
  const categoriesPage =
    await api.functional.communityPlatform.categories.index(connection, {
      body: {
        page: 1 satisfies number as number,
        limit: 1 satisfies number as number,
        active: true,
        sortBy: "created_at",
        direction: "desc",
      } satisfies ICommunityPlatformCategory.IRequest,
    });
  typia.assert(categoriesPage);
  TestValidator.predicate(
    "category list should not be empty",
    categoriesPage.data.length > 0,
  );
  const category = categoriesPage.data[0]!;

  // 3) Create a community in the discovered category
  const communityName = `c-${RandomGenerator.alphabets(6)}`; // matches name pattern
  const community =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      {
        body: {
          name: communityName,
          community_platform_category_id: category.id,
          description: RandomGenerator.paragraph({ sentences: 6 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);

  // 3-2) Create a post inside the community
  const post =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      {
        communityId: community.id,
        body: {
          title: RandomGenerator.paragraph({ sentences: 5 }),
          body: RandomGenerator.content({
            paragraphs: 2,
            sentenceMin: 10,
            sentenceMax: 15,
          }),
        } satisfies ICommunityPlatformPost.ICreate,
      },
    );
  typia.assert(post);

  // 4) Create a top-level parent comment (omit parent_id)
  const parent =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      connection,
      {
        postId: post.id,
        body: {
          content: RandomGenerator.paragraph({ sentences: 8 }),
        } satisfies ICommunityPlatformComment.ICreate,
      },
    );
  typia.assert(parent);

  // 5) Create 25 replies under the parent comment
  const REPLY_COUNT = 25;
  const replies: ICommunityPlatformComment[] = await ArrayUtil.asyncRepeat(
    REPLY_COUNT,
    async () => {
      const reply =
        await api.functional.communityPlatform.communityMember.comments.replies.create(
          connection,
          {
            commentId: parent.id,
            body: {
              content: RandomGenerator.paragraph({ sentences: 6 }),
            } satisfies ICommunityPlatformComment.ICreate,
          },
        );
      typia.assert(reply);
      return reply;
    },
  );

  // Comparator: created_at desc, then id desc
  const compareNewest = (
    a: ICommunityPlatformComment,
    b: ICommunityPlatformComment,
  ): number => {
    if (a.created_at !== b.created_at)
      return b.created_at.localeCompare(a.created_at);
    return b.id.localeCompare(a.id);
  };

  // Expected order from our created replies
  const sortedReplies = [...replies].sort(compareNewest);

  // 6) List replies: page 0 and page 1 with limit 20, sort Newest
  const limit = 20;
  const page0 = await api.functional.communityPlatform.comments.replies.index(
    connection,
    {
      commentId: parent.id,
      body: {
        page: 0 satisfies number as number,
        limit: limit satisfies number as number,
        sort: "Newest",
      } satisfies ICommunityPlatformComment.IRequest,
    },
  );
  typia.assert(page0);

  const page1 = await api.functional.communityPlatform.comments.replies.index(
    connection,
    {
      commentId: parent.id,
      body: {
        page: 1 satisfies number as number,
        limit: limit satisfies number as number,
        sort: "Newest",
      } satisfies ICommunityPlatformComment.IRequest,
    },
  );
  typia.assert(page1);

  // 7) Assertions
  // 7-1) Page sizes
  const expectedFirstLen = Math.min(limit, sortedReplies.length);
  const expectedSecondLen = Math.max(0, sortedReplies.length - limit);
  TestValidator.equals(
    "first page should contain min(limit, total) items",
    page0.data.length,
    expectedFirstLen,
  );
  TestValidator.equals(
    "second page should contain remaining items",
    page1.data.length,
    expectedSecondLen,
  );

  // 7-2) Ordering matches expectations using TestValidator.index (by IDs)
  const expectedPage0 = sortedReplies.slice(0, limit);
  const expectedPage1 = sortedReplies.slice(limit, limit * 2);
  TestValidator.index(
    "page 0 items must match expected Newest order",
    expectedPage0,
    page0.data,
  );
  TestValidator.index(
    "page 1 items must match expected Newest order",
    expectedPage1,
    page1.data,
  );

  // 7-3) Each reply belongs to the parent (parent_id === parent.id)
  const allListed = [...page0.data, ...page1.data];
  for (const item of allListed) {
    TestValidator.equals(
      "reply parent_id equals parent.id",
      item.parent_id,
      parent.id,
    );
  }

  // 7-4) No overlap between page 0 and page 1
  const ids0 = new Set(page0.data.map((d) => d.id));
  const overlapping = page1.data.some((d) => ids0.has(d.id));
  TestValidator.predicate("no overlap between page 0 and page 1", !overlapping);

  // 7-5) Validate each page is internally sorted by Newest
  const isSortedDesc = (arr: ICommunityPlatformComment[]): boolean => {
    for (let i = 1; i < arr.length; ++i) {
      if (compareNewest(arr[i - 1]!, arr[i]!) > 0) return false;
    }
    return true;
  };
  TestValidator.predicate(
    "page 0 is sorted by created_at desc then id desc",
    isSortedDesc(page0.data),
  );
  TestValidator.predicate(
    "page 1 is sorted by created_at desc then id desc",
    isSortedDesc(page1.data),
  );
}
