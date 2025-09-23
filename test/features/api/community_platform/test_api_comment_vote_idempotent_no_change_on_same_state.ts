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
 * Validate idempotent behavior of comment vote updates when submitting the same
 * state repeatedly.
 *
 * Scenario:
 *
 * 1. User A joins, fetches a category, creates a community, adds a post, and
 *    writes a comment.
 * 2. Ensure author cannot vote on own comment (expect an error when User A
 *    attempts to Upvote their own comment).
 * 3. User B joins and casts an Upvote on the comment.
 * 4. User B submits the same Upvote again to validate idempotency.
 *
 * Validations:
 *
 * - API responses conform to expected DTO types (typia.assert).
 * - Second PUT returns the same state and the same vote record id as the first
 *   PUT (no duplicate active records created for the same (commentId,
 *   userId)).
 * - Created_at remains unchanged; updated_at is not earlier than the first call
 *   (monotonic non-decreasing allows both strict idempotent no-op and
 *   update-on-write policies).
 * - Voter (User B) is different from the author (User A).
 */
export async function test_api_comment_vote_idempotent_no_change_on_same_state(
  connection: api.IConnection,
) {
  // 1) User A joins (author)
  const userAJoinBody = {
    username: RandomGenerator.name(1),
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const userAAuthorized: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(connection, {
      body: userAJoinBody,
    });
  typia.assert<ICommunityPlatformCommunityMember.IAuthorized>(userAAuthorized);

  // 2) Fetch a valid category to create a community
  const categoryReq = {
    active: true,
    limit: 10,
    sortBy: "display_order",
    direction: "asc",
  } satisfies ICommunityPlatformCategory.IRequest;
  const categoryPage = await api.functional.communityPlatform.categories.index(
    connection,
    { body: categoryReq },
  );
  typia.assert<IPageICommunityPlatformCategory.ISummary>(categoryPage);
  await TestValidator.predicate(
    "at least one active category must exist",
    async () => categoryPage.data.length > 0,
  );
  const categoryId = categoryPage.data[0].id;

  // 3) Create a community as User A
  const communityName = `c${RandomGenerator.alphaNumeric(10)}`; // starts with letter, ends alnum
  const communityCreateBody = {
    name: communityName,
    community_platform_category_id: categoryId,
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community: ICommunityPlatformCommunity =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      { body: communityCreateBody },
    );
  typia.assert<ICommunityPlatformCommunity>(community);

  // 4) Create a post in the community as User A
  const postCreateBody = {
    title: RandomGenerator.paragraph({ sentences: 5 }),
    body: RandomGenerator.content({
      paragraphs: 2,
      sentenceMin: 8,
      sentenceMax: 16,
    }),
    author_display_name: RandomGenerator.name(1),
  } satisfies ICommunityPlatformPost.ICreate;
  const post: ICommunityPlatformPost =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      { communityId: community.id, body: postCreateBody },
    );
  typia.assert<ICommunityPlatformPost>(post);

  // 5) Create a comment on the post as User A
  const commentCreateBody = {
    content: RandomGenerator.paragraph({ sentences: 8 }),
  } satisfies ICommunityPlatformComment.ICreate;
  const comment: ICommunityPlatformComment =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      connection,
      { postId: post.id, body: commentCreateBody },
    );
  typia.assert<ICommunityPlatformComment>(comment);

  // 6) Verify business rule: author cannot vote on own comment
  const voteUpState: IECommunityPlatformCommentVoteState = "Upvote";
  await TestValidator.error(
    "author cannot vote their own comment",
    async () => {
      await api.functional.communityPlatform.communityMember.comments.votes.update(
        connection,
        {
          commentId: comment.id,
          body: {
            state: voteUpState,
          } satisfies ICommunityPlatformCommentVote.IUpdate,
        },
      );
    },
  );

  // 7) User B joins (voter)
  const userBJoinBody = {
    username: RandomGenerator.name(1),
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const userBAuthorized: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(connection, {
      body: userBJoinBody,
    });
  typia.assert<ICommunityPlatformCommunityMember.IAuthorized>(userBAuthorized);

  // 8) User B casts Upvote first time
  const firstVote: ICommunityPlatformCommentVote =
    await api.functional.communityPlatform.communityMember.comments.votes.update(
      connection,
      {
        commentId: comment.id,
        body: {
          state: voteUpState,
        } satisfies ICommunityPlatformCommentVote.IUpdate,
      },
    );
  typia.assert<ICommunityPlatformCommentVote>(firstVote);

  // 9) User B repeats the same Upvote (idempotent)
  const secondVote: ICommunityPlatformCommentVote =
    await api.functional.communityPlatform.communityMember.comments.votes.update(
      connection,
      {
        commentId: comment.id,
        body: {
          state: voteUpState,
        } satisfies ICommunityPlatformCommentVote.IUpdate,
      },
    );
  typia.assert<ICommunityPlatformCommentVote>(secondVote);

  // Validations
  TestValidator.equals(
    "state remains Upvote on repeated submission",
    secondVote.state,
    voteUpState,
  );
  TestValidator.equals(
    "same vote record id after idempotent call",
    secondVote.id,
    firstVote.id,
  );
  TestValidator.equals(
    "comment id remains consistent",
    secondVote.community_platform_comment_id,
    firstVote.community_platform_comment_id,
  );
  TestValidator.equals(
    "voter user id remains consistent",
    secondVote.community_platform_user_id,
    firstVote.community_platform_user_id,
  );
  TestValidator.equals(
    "created_at unchanged across idempotent calls",
    secondVote.created_at,
    firstVote.created_at,
  );
  await TestValidator.predicate(
    "updated_at is not earlier than initial updated_at",
    async () =>
      new Date(secondVote.updated_at).getTime() >=
      new Date(firstVote.updated_at).getTime(),
  );
  await TestValidator.predicate(
    "voter differs from comment author",
    async () =>
      secondVote.community_platform_user_id !==
      comment.community_platform_user_id,
  );
}
