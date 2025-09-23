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
 * Ensure replies listing excludes logically removed child comments.
 *
 * Steps:
 *
 * 1. Join as a community member (auth token managed by SDK)
 * 2. List categories and pick one
 * 3. Create a community
 * 4. Create a post within the community
 * 5. Create a parent (top-level) comment for the post
 * 6. Create two replies under the parent comment
 * 7. Soft-delete one reply
 * 8. List replies of the parent
 * 9. Validate that only the non-deleted reply remains and all replies point to the
 *    parent
 */
export async function test_api_comment_replies_excludes_deleted_children(
  connection: api.IConnection,
) {
  // 1) Authenticate as a community member
  const authorized = await api.functional.auth.communityMember.join(
    connection,
    {
      body: typia.random<ICommunityPlatformCommunityMember.ICreate>(),
    },
  );
  typia.assert(authorized);

  // 2) Discover a category for community creation
  const categoryReq = {
    page: 1,
    limit: 20,
    active: true,
    sortBy: "display_order",
    direction: "asc",
  } satisfies ICommunityPlatformCategory.IRequest;
  const categories = await api.functional.communityPlatform.categories.index(
    connection,
    { body: categoryReq },
  );
  typia.assert(categories);
  TestValidator.predicate(
    "at least one category must be available for community creation",
    categories.data.length > 0,
  );
  const category = categories.data[0];

  // 3) Create a community
  const communityBody = {
    name: `c${RandomGenerator.alphaNumeric(10)}`,
    community_platform_category_id: category.id,
    description: RandomGenerator.paragraph({ sentences: 8 }),
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      { body: communityBody },
    );
  typia.assert(community);

  // 4) Create a post within the community
  const postBody = {
    title: RandomGenerator.paragraph({ sentences: 6 }),
    body: RandomGenerator.content({
      paragraphs: 1,
      sentenceMin: 12,
      sentenceMax: 20,
    }),
  } satisfies ICommunityPlatformPost.ICreate;
  const post =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      { communityId: community.id, body: postBody },
    );
  typia.assert(post);

  // 5) Create a parent (top-level) comment
  const parentCommentBody = {
    content: RandomGenerator.paragraph({ sentences: 6 }),
  } satisfies ICommunityPlatformComment.ICreate;
  const parent =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      connection,
      { postId: post.id, body: parentCommentBody },
    );
  typia.assert(parent);

  // 6) Create two replies under the parent comment
  const replyBodyA = {
    content: RandomGenerator.paragraph({ sentences: 5 }),
    parent_id: parent.id,
  } satisfies ICommunityPlatformComment.ICreate;
  const replyA =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      connection,
      { postId: post.id, body: replyBodyA },
    );
  typia.assert(replyA);

  const replyBodyB = {
    content: RandomGenerator.paragraph({ sentences: 5 }),
    parent_id: parent.id,
  } satisfies ICommunityPlatformComment.ICreate;
  const replyB =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      connection,
      { postId: post.id, body: replyBodyB },
    );
  typia.assert(replyB);

  // 7) Soft-delete one reply (replyA)
  await api.functional.communityPlatform.communityMember.comments.erase(
    connection,
    { commentId: replyA.id },
  );

  // 8) List replies for the parent comment
  const listReq = {
    page: 0,
    limit: 10,
    sort: "Newest",
  } satisfies ICommunityPlatformComment.IRequest;
  const pageReplies =
    await api.functional.communityPlatform.comments.replies.index(connection, {
      commentId: parent.id,
      body: listReq,
    });
  typia.assert(pageReplies);

  // 9) Validate: deleted reply excluded; non-deleted reply present; parent relation correct
  const ids = pageReplies.data.map((c) => c.id);
  const hasDeleted = ids.includes(replyA.id);
  const hasAlive = ids.includes(replyB.id);

  TestValidator.equals(
    "deleted reply must not appear in replies listing",
    hasDeleted,
    false,
  );
  TestValidator.equals(
    "non-deleted reply must appear in replies listing",
    hasAlive,
    true,
  );
  TestValidator.predicate(
    "all replies have the correct parent_id",
    pageReplies.data.every((c) => c.parent_id === parent.id),
  );
  TestValidator.equals(
    "exactly one reply should remain after deletion",
    pageReplies.data.length,
    1,
  );
}
