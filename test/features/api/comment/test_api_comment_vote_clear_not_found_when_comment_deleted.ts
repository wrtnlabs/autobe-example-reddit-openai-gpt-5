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
 * Ensure vote clearing fails when the target comment has been deleted.
 *
 * Business context:
 *
 * - Communities require an active category; acquire one from categories index.
 * - Two members are needed: User A (author of comment) and User B (voter).
 * - After User B votes on User A's comment, User A deletes the comment.
 * - Any subsequent attempt by User B to clear or re-apply a vote must error
 *   because the comment no longer exists in active view.
 *
 * Steps:
 *
 * 1. Create two isolated authenticated contexts via join(): authorConn (User A)
 *    and voterConn (User B).
 * 2. As User A: fetch an active category; create a community; create a post;
 *    create a comment.
 * 3. As User B: set an initial vote (Upvote) on the comment.
 * 4. As User A: delete the comment (soft delete).
 * 5. As User B: attempt to clear the vote (DELETE votes) and expect an error.
 * 6. Additionally, attempt to re-apply a vote (PUT votes) and expect an error.
 *
 * Assertions:
 *
 * - Typia.assert() on all non-void responses.
 * - TestValidator.equals for verifying initial vote state echo.
 * - Await TestValidator.error for both negative cases after deletion.
 */
export async function test_api_comment_vote_clear_not_found_when_comment_deleted(
  connection: api.IConnection,
) {
  // Prepare two separate connections so tokens don't overwrite each other
  const authorConn: api.IConnection = { ...connection, headers: {} };
  const voterConn: api.IConnection = { ...connection, headers: {} };

  // 1) Register User A (author)
  const authorJoinBody = {
    username: `${RandomGenerator.name(1).replace(/\s+/g, "")}_${RandomGenerator.alphaNumeric(6)}`,
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const authorAuth: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(authorConn, {
      body: authorJoinBody,
    });
  typia.assert(authorAuth);

  // 1) Register User B (voter)
  const voterJoinBody = {
    username: `${RandomGenerator.name(1).replace(/\s+/g, "")}_${RandomGenerator.alphaNumeric(6)}`,
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const voterAuth: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(voterConn, {
      body: voterJoinBody,
    });
  typia.assert(voterAuth);

  // 2) Acquire a valid active category (public read)
  const categoriesPage: IPageICommunityPlatformCategory.ISummary =
    await api.functional.communityPlatform.categories.index(authorConn, {
      body: {
        page: 1 satisfies number as number,
        limit: 10 satisfies number as number,
        active: true,
        sortBy: "display_order",
        direction: "asc",
        search: null,
        created_from: null,
        created_to: null,
      } satisfies ICommunityPlatformCategory.IRequest,
    });
  typia.assert(categoriesPage);
  TestValidator.predicate(
    "at least one active category exists",
    categoriesPage.data.length > 0,
  );
  const categoryId = categoriesPage.data[0].id;

  // 2) Create a community as User A
  const communityName = `c${RandomGenerator.alphaNumeric(10)}`; // starts with letter, ends alnum, length within 3-32
  const communityBody = {
    name: communityName,
    community_platform_category_id: categoryId,
    description: RandomGenerator.paragraph({ sentences: 8 }),
    logo: null,
    banner: null,
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community: ICommunityPlatformCommunity =
    await api.functional.communityPlatform.communityMember.communities.create(
      authorConn,
      { body: communityBody },
    );
  typia.assert(community);

  // 2) Create a post as User A
  const postBody = {
    // path carries the community id; body can omit community id
    title: RandomGenerator.paragraph({ sentences: 5 }),
    body: RandomGenerator.content({
      paragraphs: 1,
      sentenceMin: 12,
      sentenceMax: 20,
      wordMin: 3,
      wordMax: 8,
    }),
    author_display_name: RandomGenerator.name(1),
  } satisfies ICommunityPlatformPost.ICreate;
  const post: ICommunityPlatformPost =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      authorConn,
      {
        communityId: community.id,
        body: postBody,
      },
    );
  typia.assert(post);

  // 2) Create a comment as User A
  const commentBody = {
    content: RandomGenerator.paragraph({ sentences: 12 }),
    parent_id: null,
  } satisfies ICommunityPlatformComment.ICreate;
  const comment: ICommunityPlatformComment =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      authorConn,
      {
        postId: post.id,
        body: commentBody,
      },
    );
  typia.assert(comment);

  // 3) As User B, cast an initial vote on the comment
  const voteState: IECommunityPlatformCommentVoteState = "Upvote";
  const vote: ICommunityPlatformCommentVote =
    await api.functional.communityPlatform.communityMember.comments.votes.update(
      voterConn,
      {
        commentId: comment.id,
        body: {
          state: voteState,
        } satisfies ICommunityPlatformCommentVote.IUpdate,
      },
    );
  typia.assert(vote);
  TestValidator.equals(
    "vote state should echo the requested state",
    vote.state,
    voteState,
  );

  // 4) As User A, delete the comment (soft delete)
  await api.functional.communityPlatform.communityMember.comments.erase(
    authorConn,
    { commentId: comment.id },
  );

  // 5) As User B, attempt to clear the vote on the deleted comment → expect error
  await TestValidator.error(
    "clearing vote must fail when comment has been deleted",
    async () => {
      await api.functional.communityPlatform.communityMember.comments.votes.erase(
        voterConn,
        { commentId: comment.id },
      );
    },
  );

  // 6) Additionally, attempting to re-apply a vote on the deleted comment should also fail
  await TestValidator.error(
    "re-applying a vote must fail on a deleted comment",
    async () => {
      await api.functional.communityPlatform.communityMember.comments.votes.update(
        voterConn,
        {
          commentId: comment.id,
          body: {
            state: "Downvote",
          } satisfies ICommunityPlatformCommentVote.IUpdate,
        },
      );
    },
  );
}
