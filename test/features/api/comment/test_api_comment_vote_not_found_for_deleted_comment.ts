import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCategory";
import type { ICommunityPlatformComment } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformComment";
import type { ICommunityPlatformCommentVote } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommentVote";
import type { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformPost } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformPost";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";
import type { IECategorySortBy } from "@ORGANIZATION/PROJECT-api/lib/structures/IECategorySortBy";
import type { IECommunityPlatformCommentVoteState } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformCommentVoteState";
import type { IESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IESortDirection";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformCategory";

/**
 * Ensure voting fails with not-found semantics when the target comment has been
 * logically removed.
 *
 * Business context:
 *
 * - A comment deleted by its author (soft delete: deleted_at set) should no
 *   longer be votable.
 * - Another authenticated member attempting to vote should receive an error.
 *
 * Steps:
 *
 * 1. Join as User A (author).
 * 2. Pick an active category.
 * 3. Create a community as User A.
 * 4. Create a post in that community.
 * 5. Create a comment on the post as User A.
 * 6. Delete (soft-delete) the comment as User A.
 * 7. Join as User B (voter), switching authentication context.
 * 8. Attempt to vote on the deleted comment with state "Upvote" and expect an
 *    error.
 */
export async function test_api_comment_vote_not_found_for_deleted_comment(
  connection: api.IConnection,
) {
  // 1) Join as User A (author)
  const userAJoinBody = {
    username: `userA_${RandomGenerator.alphabets(8)}`,
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const userAAuth = await api.functional.auth.communityMember.join(connection, {
    body: userAJoinBody,
  });
  typia.assert(userAAuth);

  // 2) Pick an active category
  const categoryReq = {
    active: true,
    limit: 5,
    sortBy: "display_order",
    direction: "asc",
  } satisfies ICommunityPlatformCategory.IRequest;
  const categoryPage = await api.functional.communityPlatform.categories.index(
    connection,
    { body: categoryReq },
  );
  typia.assert(categoryPage);
  TestValidator.predicate(
    "at least one active category exists",
    categoryPage.data.length > 0,
  );
  const category = categoryPage.data[0];

  // 3) Create a community as User A
  const communityName = `c${RandomGenerator.alphabets(7)}`; // 8 chars, starts with letter
  const createCommunityBody = {
    name: communityName,
    community_platform_category_id: category.id,
    description: RandomGenerator.paragraph({ sentences: 8 }),
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      { body: createCommunityBody },
    );
  typia.assert(community);

  // 4) Create a post in that community
  const createPostBody = {
    title: RandomGenerator.paragraph({ sentences: 5 }),
    body: RandomGenerator.content({
      paragraphs: 1,
      sentenceMin: 10,
      sentenceMax: 15,
    }),
  } satisfies ICommunityPlatformPost.ICreate;
  const post =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      { communityId: community.id, body: createPostBody },
    );
  typia.assert(post);
  TestValidator.equals(
    "post belongs to the created community",
    post.community_platform_community_id,
    community.id,
  );

  // 5) Create a comment on the post as User A
  const createCommentBody = {
    content: RandomGenerator.paragraph({ sentences: 12 }),
  } satisfies ICommunityPlatformComment.ICreate;
  const comment =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      connection,
      { postId: post.id, body: createCommentBody },
    );
  typia.assert(comment);
  TestValidator.equals(
    "comment belongs to the post",
    comment.community_platform_post_id,
    post.id,
  );
  TestValidator.equals(
    "comment author is User A",
    comment.community_platform_user_id,
    userAAuth.id,
  );

  // 6) Delete (soft-delete) the comment as User A
  await api.functional.communityPlatform.communityMember.comments.erase(
    connection,
    { commentId: comment.id },
  );

  // 7) Join as User B (voter), switching authentication context
  const userBJoinBody = {
    username: `userB_${RandomGenerator.alphabets(8)}`,
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const userBAuth = await api.functional.auth.communityMember.join(connection, {
    body: userBJoinBody,
  });
  typia.assert(userBAuth);

  // 8) Attempt to vote on the deleted comment and expect an error
  await TestValidator.error(
    "voting on a deleted comment should fail",
    async () => {
      await api.functional.communityPlatform.communityMember.comments.votes.update(
        connection,
        {
          commentId: comment.id,
          body: {
            state: "Upvote",
          } satisfies ICommunityPlatformCommentVote.IUpdate,
        },
      );
    },
  );
}
