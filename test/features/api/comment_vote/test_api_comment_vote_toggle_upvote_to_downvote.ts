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

export async function test_api_comment_vote_toggle_upvote_to_downvote(
  connection: api.IConnection,
) {
  /**
   * Validate toggling a vote from Upvote to Downvote for the same (comment,
   * user) pair.
   *
   * Steps:
   *
   * 1. Provision two users: User A (author) and User B (voter)
   * 2. User A selects a category, creates a community, creates a post, and creates
   *    a comment
   * 3. User B votes Upvote on the comment
   * 4. User B toggles the vote to Downvote
   * 5. Validate: state changes to Downvote, record id remains the same, updated_at
   *    increases, and ownership is User B
   * 6. Negative test: User A (author) cannot vote on own comment
   */

  // Create isolated connections per user (no header manipulation after creation)
  const connA: api.IConnection = { ...connection, headers: {} };
  const connB: api.IConnection = { ...connection, headers: {} };

  // 1) Provision users A and B
  const joinABody = {
    username: `usera_${RandomGenerator.alphaNumeric(8)}`,
    email: typia.random<string & tags.Format<"email">>(),
    password: `P${RandomGenerator.alphaNumeric(9)}`,
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const userA: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(connA, {
      body: joinABody,
    });
  typia.assert(userA);

  const joinBBody = {
    username: `userb_${RandomGenerator.alphaNumeric(8)}`,
    email: typia.random<string & tags.Format<"email">>(),
    password: `P${RandomGenerator.alphaNumeric(9)}`,
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const userB: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(connB, {
      body: joinBBody,
    });
  typia.assert(userB);

  // 2) User A: pick an active category, create community, post, and comment
  const categoriesPage: IPageICommunityPlatformCategory.ISummary =
    await api.functional.communityPlatform.categories.index(connA, {
      body: {
        page: 1,
        limit: 20,
        active: true,
        sortBy: "display_order",
        direction: "asc",
      } satisfies ICommunityPlatformCategory.IRequest,
    });
  typia.assert(categoriesPage);
  await TestValidator.predicate(
    "at least one active category must exist",
    async () => categoriesPage.data.length > 0,
  );
  const category = categoriesPage.data[0];

  const communityBody = {
    name: `c${RandomGenerator.alphaNumeric(10)}`,
    community_platform_category_id: category.id,
    description: RandomGenerator.paragraph({ sentences: 8 }),
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community: ICommunityPlatformCommunity =
    await api.functional.communityPlatform.communityMember.communities.create(
      connA,
      { body: communityBody },
    );
  typia.assert(community);

  const postBody = {
    title: RandomGenerator.paragraph({ sentences: 5 }),
    body: RandomGenerator.content({
      paragraphs: 1,
      sentenceMin: 12,
      sentenceMax: 20,
      wordMin: 3,
      wordMax: 8,
    }),
    author_display_name: RandomGenerator.name(2),
  } satisfies ICommunityPlatformPost.ICreate;
  const post: ICommunityPlatformPost =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connA,
      {
        communityId: community.id,
        body: postBody,
      },
    );
  typia.assert(post);

  const commentBody = {
    content: RandomGenerator.paragraph({ sentences: 10 }),
  } satisfies ICommunityPlatformComment.ICreate;
  const comment: ICommunityPlatformComment =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      connA,
      {
        postId: post.id,
        body: commentBody,
      },
    );
  typia.assert(comment);

  // 3) User B: Upvote the comment
  const upvoteBody = {
    state: "Upvote",
  } satisfies ICommunityPlatformCommentVote.IUpdate;
  const upvote: ICommunityPlatformCommentVote =
    await api.functional.communityPlatform.communityMember.comments.votes.update(
      connB,
      {
        commentId: comment.id,
        body: upvoteBody,
      },
    );
  typia.assert(upvote);
  TestValidator.equals("upvote state is Upvote", upvote.state, "Upvote");
  TestValidator.equals(
    "vote is tied to the target comment",
    upvote.community_platform_comment_id,
    comment.id,
  );
  TestValidator.equals(
    "vote belongs to User B",
    upvote.community_platform_user_id,
    userB.id,
  );

  // 4) User B: Toggle to Downvote
  const downvoteBody = {
    state: "Downvote",
  } satisfies ICommunityPlatformCommentVote.IUpdate;
  const downvote: ICommunityPlatformCommentVote =
    await api.functional.communityPlatform.communityMember.comments.votes.update(
      connB,
      {
        commentId: comment.id,
        body: downvoteBody,
      },
    );
  typia.assert(downvote);
  TestValidator.equals("toggled state is Downvote", downvote.state, "Downvote");
  TestValidator.equals(
    "vote record identity remains the same",
    downvote.id,
    upvote.id,
  );
  TestValidator.predicate(
    "updated_at increased after toggle",
    new Date(downvote.updated_at).getTime() >
      new Date(upvote.updated_at).getTime(),
  );
  TestValidator.equals(
    "vote still bound to same comment",
    downvote.community_platform_comment_id,
    comment.id,
  );
  TestValidator.equals(
    "vote still belongs to User B",
    downvote.community_platform_user_id,
    userB.id,
  );

  // 5) Negative test: User A cannot vote on own comment
  await TestValidator.error("author cannot vote on own comment", async () => {
    await api.functional.communityPlatform.communityMember.comments.votes.update(
      connA,
      {
        commentId: comment.id,
        body: {
          state: "Upvote",
        } satisfies ICommunityPlatformCommentVote.IUpdate,
      },
    );
  });
}
