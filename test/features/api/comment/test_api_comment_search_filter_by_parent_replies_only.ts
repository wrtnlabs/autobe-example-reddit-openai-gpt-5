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
 * Verify comment search parent_id filtering returns only replies to a specific
 * parent.
 *
 * Business context:
 *
 * - Users search comments platform-wide. When parent_id is provided, only direct
 *   replies to that parent must be returned. Results follow Newest ordering
 *   (created_at DESC, id DESC for ties).
 *
 * Steps:
 *
 * 1. Join as a community member (authenticate).
 * 2. Fetch an active category (fallback to any category if none active).
 * 3. Create a community under the category.
 * 4. Create a post in the community.
 * 5. Create a parent comment P (content includes "hanok").
 * 6. Create two replies R1, R2 to P (each includes "hanok").
 * 7. Create another parent comment Q (no keyword) and a reply Q1 (includes
 *    "hanok").
 * 8. Search with query "hanok" and parent_id=P.id, scoped by post_id, sort=Newest.
 * 9. Validate only R1 and R2 are returned, Q1 excluded, order=Newest, pagination
 *    sane.
 * 10. Edge: non-existent parent_id → empty results.
 */
export async function test_api_comment_search_filter_by_parent_replies_only(
  connection: api.IConnection,
) {
  // 1) Authenticate as a community member
  const auth = await api.functional.auth.communityMember.join(connection, {
    body: {
      username: `user_${RandomGenerator.alphaNumeric(8)}`,
      email: typia.random<string & tags.Format<"email">>(),
      password: `Pwd_${RandomGenerator.alphaNumeric(10)}`,
    } satisfies ICommunityPlatformCommunityMember.ICreate,
  });
  typia.assert(auth);

  // 2) Obtain an active category (fallback to any if none active)
  const catActive = await api.functional.communityPlatform.categories.index(
    connection,
    {
      body: {
        active: true,
        limit: 1,
        sortBy: "display_order",
        direction: "asc",
      } satisfies ICommunityPlatformCategory.IRequest,
    },
  );
  typia.assert(catActive);
  let categoryId: (string & tags.Format<"uuid">) | undefined =
    catActive.data[0]?.id;
  if (!categoryId) {
    const catAny = await api.functional.communityPlatform.categories.index(
      connection,
      {
        body: {
          limit: 1,
        } satisfies ICommunityPlatformCategory.IRequest,
      },
    );
    typia.assert(catAny);
    categoryId = catAny.data[0]?.id;
  }
  TestValidator.predicate(
    "a category must be available for community creation",
    categoryId !== undefined,
  );
  const safeCategoryId = typia.assert<string & tags.Format<"uuid">>(
    categoryId!,
  );

  // Helper to build a valid community name per pattern:
  // ^[A-Za-z][A-Za-z0-9_-]{1,30}[A-Za-z0-9]$
  const head = RandomGenerator.alphabets(1); // first letter
  const mid = RandomGenerator.alphaNumeric(6).replace(/[^A-Za-z0-9_-]/g, "");
  const tail = RandomGenerator.alphaNumeric(1).replace(/[^A-Za-z0-9]/g, "a");
  const communityName = `${head}${mid}${tail}`;

  // 3) Create a community
  const community =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      {
        body: {
          name: communityName,
          community_platform_category_id: safeCategoryId,
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
          title: RandomGenerator.paragraph({ sentences: 5 }),
          body: RandomGenerator.content({
            paragraphs: 2,
            sentenceMin: 8,
            sentenceMax: 16,
          }),
        } satisfies ICommunityPlatformPost.ICreate,
      },
    );
  typia.assert(post);

  // 5) Parent comment P (top-level, includes keyword)
  const parentP =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      connection,
      {
        postId: post.id,
        body: {
          content: `hanok ${RandomGenerator.paragraph({ sentences: 6 })}`,
          parent_id: null,
        } satisfies ICommunityPlatformComment.ICreate,
      },
    );
  typia.assert(parentP);

  // 6) Replies R1 and R2 to P (each includes keyword)
  const replyR1 =
    await api.functional.communityPlatform.communityMember.comments.replies.create(
      connection,
      {
        commentId: parentP.id,
        body: {
          content: `R1 hanok ${RandomGenerator.paragraph({ sentences: 4 })}`,
          parent_id: parentP.id,
        } satisfies ICommunityPlatformComment.ICreate,
      },
    );
  typia.assert(replyR1);

  const replyR2 =
    await api.functional.communityPlatform.communityMember.comments.replies.create(
      connection,
      {
        commentId: parentP.id,
        body: {
          content: `R2 hanok ${RandomGenerator.paragraph({ sentences: 4 })}`,
          parent_id: parentP.id,
        } satisfies ICommunityPlatformComment.ICreate,
      },
    );
  typia.assert(replyR2);

  // 7) Another parent Q (no keyword), and a reply Q1 with keyword
  const parentQ =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      connection,
      {
        postId: post.id,
        body: {
          content: `top-level ${RandomGenerator.paragraph({ sentences: 6 })}`,
          parent_id: null,
        } satisfies ICommunityPlatformComment.ICreate,
      },
    );
  typia.assert(parentQ);

  const replyQ1 =
    await api.functional.communityPlatform.communityMember.comments.replies.create(
      connection,
      {
        commentId: parentQ.id,
        body: {
          content: `Q1 hanok ${RandomGenerator.paragraph({ sentences: 5 })}`,
          parent_id: parentQ.id,
        } satisfies ICommunityPlatformComment.ICreate,
      },
    );
  typia.assert(replyQ1);

  // 8) Execute search with parent_id=P.id
  const page = await api.functional.communityPlatform.search.comments.index(
    connection,
    {
      body: {
        query: "hanok",
        parent_id: parentP.id,
        post_id: post.id,
        sort: "Newest",
        page: 0,
        limit: 20,
      } satisfies ICommunityPlatformComment.IRequest,
    },
  );
  typia.assert(page);

  // 9) Validations
  const ids = page.data.map((d) => d.id);
  TestValidator.predicate(
    "all results must be direct replies of P",
    page.data.every((d) => d.parent_id === parentP.id),
  );
  TestValidator.predicate(
    "results must include R1 and R2",
    ids.includes(replyR1.id) && ids.includes(replyR2.id),
  );
  TestValidator.predicate(
    "results must exclude reply Q1 (other parent)",
    !ids.includes(replyQ1.id),
  );

  // Determine expected Newest order for [R1, R2]
  const toKey = (x: ICommunityPlatformComment) => ({
    created_at: x.created_at,
    id: x.id,
  });
  const expectedOrder = [toKey(replyR1), toKey(replyR2)].sort((a, b) => {
    if (a.created_at === b.created_at) return b.id.localeCompare(a.id);
    return b.created_at.localeCompare(a.created_at);
  });
  const actualOrder = page.data
    .filter((d) => d.id === replyR1.id || d.id === replyR2.id)
    .map((d) => ({ created_at: d.created_at, id: d.id }));
  TestValidator.equals(
    "R1 and R2 appear in Newest order",
    actualOrder.map((x) => x.id),
    expectedOrder.map((x) => x.id),
  );

  // Pagination sanity checks
  TestValidator.predicate(
    "pagination limit must be positive",
    page.pagination.limit > 0,
  );
  TestValidator.predicate(
    "pagination records must be >= returned count",
    page.pagination.records >= page.data.length,
  );

  // 10) Edge: non-existent parent_id returns empty results
  const empty = await api.functional.communityPlatform.search.comments.index(
    connection,
    {
      body: {
        query: "hanok",
        parent_id: "00000000-0000-0000-0000-000000000000" as string &
          tags.Format<"uuid">,
        post_id: post.id,
        sort: "Newest",
        page: 0,
        limit: 20,
      } satisfies ICommunityPlatformComment.IRequest,
    },
  );
  typia.assert(empty);
  TestValidator.equals(
    "non-existent parent_id yields empty data",
    empty.data.length,
    0,
  );
}
