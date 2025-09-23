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
 * Validate replies filtering and cross-post parent reference handling for post
 * comments.
 *
 * Business context:
 *
 * - Comments belong to posts and can be top-level or replies (via parent_id).
 * - Reading comments supports filtering by parent_id within a specific post and
 *   uses canonical Newest ordering (created_at desc; ties by larger ID).
 *
 * This test performs a full workflow to exercise the list endpoint with
 * filtering and ordering:
 *
 * 1. Authenticate as communityMember (join)
 * 2. Discover an active category and create a community with it
 * 3. Create two posts (A, B) in that community
 * 4. Under post A, create one top-level parent comment (parent_A) and two replies
 *    to it
 * 5. Under post B, create one top-level parent comment (parent_B)
 * 6. Success case: list replies for parent_A on post A with sort = Newest and
 *    validate
 *
 *    - All items match parent_id and postId
 *    - Order is Newest with id tie-breaker
 *    - Pagination reflects the number of replies created
 * 7. Failure cases:
 *
 *    - Cross-post parent reference (parent_B on post A) must be rejected
 *    - Non-existent postId must result in not-found error
 */
export async function test_api_post_comments_replies_filter_and_cross_post_parent_validation(
  connection: api.IConnection,
) {
  // helper comparator: created_at desc, then id desc
  const newerFirst = (
    x: ICommunityPlatformComment,
    y: ICommunityPlatformComment,
  ): number => {
    if (x.created_at < y.created_at) return 1;
    if (x.created_at > y.created_at) return -1;
    // tie-break by larger identifier first (desc)
    return x.id < y.id ? 1 : x.id > y.id ? -1 : 0;
  };

  // 1) Authenticate as communityMember (join)
  const username = `user_${RandomGenerator.alphaNumeric(10)}`;
  const email = typia.random<string & tags.Format<"email">>();
  const password = `${RandomGenerator.alphaNumeric(10)}Xy`; // ensure length >= 8
  const authorized = await api.functional.auth.communityMember.join(
    connection,
    {
      body: {
        username,
        email,
        password,
      } satisfies ICommunityPlatformCommunityMember.ICreate,
    },
  );
  typia.assert(authorized);

  // 2) Discover an active category
  const catReq = {
    page: 1,
    limit: 1,
    active: true,
    sortBy: "created_at",
    direction: "desc",
  } satisfies ICommunityPlatformCategory.IRequest;
  const catPage = await api.functional.communityPlatform.categories.index(
    connection,
    {
      body: catReq,
    },
  );
  typia.assert(catPage);
  TestValidator.predicate(
    "at least one active category exists",
    catPage.data.length >= 1,
  );
  const category = catPage.data[0];

  // 3) Create a community with that category
  const communityName = `c${RandomGenerator.alphaNumeric(7)}`; // starts with letter, length 8
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

  // 4) Create two posts (A, B) in the community
  const postABody = {
    title: RandomGenerator.paragraph({ sentences: 5 }),
    body: RandomGenerator.content({ paragraphs: 2 }),
  } satisfies ICommunityPlatformPost.ICreate;
  const postBBody = {
    title: RandomGenerator.paragraph({ sentences: 6 }),
    body: RandomGenerator.content({ paragraphs: 2 }),
  } satisfies ICommunityPlatformPost.ICreate;

  const postA =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      {
        communityId: community.id,
        body: postABody,
      },
    );
  typia.assert(postA);

  const postB =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      {
        communityId: community.id,
        body: postBBody,
      },
    );
  typia.assert(postB);

  // 5) Seed comments
  // 5-1) Post A: create parent_A
  const parentA =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      connection,
      {
        postId: postA.id,
        body: {
          content: RandomGenerator.paragraph({ sentences: 8 }),
        } satisfies ICommunityPlatformComment.ICreate,
      },
    );
  typia.assert(parentA);

  // 5-2) Replies to parent_A
  const reply1 =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      connection,
      {
        postId: postA.id,
        body: {
          content: RandomGenerator.paragraph({ sentences: 4 }),
          parent_id: parentA.id,
        } satisfies ICommunityPlatformComment.ICreate,
      },
    );
  typia.assert(reply1);

  const reply2 =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      connection,
      {
        postId: postA.id,
        body: {
          content: RandomGenerator.paragraph({ sentences: 5 }),
          parent_id: parentA.id,
        } satisfies ICommunityPlatformComment.ICreate,
      },
    );
  typia.assert(reply2);

  // 5-3) Post B: create parent_B
  const parentB =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      connection,
      {
        postId: postB.id,
        body: {
          content: RandomGenerator.paragraph({ sentences: 7 }),
        } satisfies ICommunityPlatformComment.ICreate,
      },
    );
  typia.assert(parentB);

  // 6) Success case: list replies of parent_A on post A
  const listReq = {
    page: 0,
    limit: 20,
    parent_id: parentA.id,
    sort: "Newest",
  } satisfies ICommunityPlatformComment.IRequest;
  const page = await api.functional.communityPlatform.posts.comments.index(
    connection,
    {
      postId: postA.id,
      body: listReq,
    },
  );
  typia.assert(page);

  // Validate: only replies of parent_A and within post A
  TestValidator.predicate(
    "only replies of the specified parent in the same post are returned",
    page.data.every(
      (c) =>
        c.parent_id === parentA.id && c.community_platform_post_id === postA.id,
    ),
  );

  // Validate: ordering is Newest (created_at desc, tie-break by id desc)
  const expectedOrder = [reply1, reply2].sort(newerFirst);
  TestValidator.index(
    "replies are sorted by Newest order with deterministic tie-breaker",
    expectedOrder,
    page.data,
  );

  // Validate: pagination metadata and count
  TestValidator.equals(
    "pagination records equals number of replies created",
    page.pagination.records,
    2,
  );
  TestValidator.equals(
    "returned item count equals created replies count",
    page.data.length,
    2,
  );

  // 7) Failure cases
  // 7-1) Cross-post parentId: parent_B belongs to post B, but query post A
  await TestValidator.error(
    "cross-post parent_id must be rejected",
    async () => {
      await api.functional.communityPlatform.posts.comments.index(connection, {
        postId: postA.id,
        body: {
          parent_id: parentB.id,
          sort: "Newest",
        } satisfies ICommunityPlatformComment.IRequest,
      });
    },
  );

  // 7-2) Non-existent postId (valid UUID)
  const missingPostId = typia.random<string & tags.Format<"uuid">>();
  await TestValidator.error(
    "listing comments for non-existent postId should fail",
    async () => {
      await api.functional.communityPlatform.posts.comments.index(connection, {
        postId: missingPostId,
        body: {
          page: 0,
          limit: 10,
          sort: "Newest",
        } satisfies ICommunityPlatformComment.IRequest,
      });
    },
  );
}
