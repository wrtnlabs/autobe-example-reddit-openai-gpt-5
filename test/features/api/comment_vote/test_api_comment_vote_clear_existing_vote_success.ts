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
 * Clear an existing vote on a comment and validate re-vote.
 *
 * Scenario (adapted to available APIs):
 *
 * 1. Join three users: A (author), C (another voter), B (voter who will clear).
 * 2. A creates a community, a post in it, and a comment under the post.
 * 3. C votes (Downvote) on the comment to establish another user’s vote exists.
 * 4. B votes (Upvote) on the comment; then B clears their vote via DELETE.
 * 5. B immediately re-votes (Downvote) to verify re-vote is allowed after
 *    clearing.
 *
 * Notes:
 *
 * - Due to lack of a login endpoint, we cannot switch back to the exact same
 *   logical user C to assert ID stability of C’s prior vote. Therefore, the
 *   test focuses on verifying the caller’s clear and re-vote flows thoroughly,
 *   and confirms C and B are distinct voters.
 */
export async function test_api_comment_vote_clear_existing_vote_success(
  connection: api.IConnection,
) {
  // Helpers for credentials
  const randomEmail = (): string & tags.Format<"email"> =>
    typia.random<string & tags.Format<"email">>();
  const randomPassword = (): string => `P${RandomGenerator.alphaNumeric(12)}`; // >= 8 chars
  const randomUsername = (): string =>
    `user_${RandomGenerator.alphaNumeric(10)}`;

  // 1) User A (author)
  const userA = await api.functional.auth.communityMember.join(connection, {
    body: {
      username: randomUsername(),
      email: randomEmail(),
      password: randomPassword(),
    } satisfies ICommunityPlatformCommunityMember.ICreate,
  });
  typia.assert<ICommunityPlatformCommunityMember.IAuthorized>(userA);

  // 2) Active category discovery
  const categoriesPage =
    await api.functional.communityPlatform.categories.index(connection, {
      body: {
        active: true,
        limit: 20,
      } satisfies ICommunityPlatformCategory.IRequest,
    });
  typia.assert<IPageICommunityPlatformCategory.ISummary>(categoriesPage);
  await TestValidator.predicate(
    "at least one active category exists",
    async () => categoriesPage.data.length > 0,
  );
  const categoryId = categoriesPage.data[0]!.id;

  // Create community as A
  const communityName = `c${RandomGenerator.alphaNumeric(7)}`; // starts with a letter
  const community =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      {
        body: {
          name: communityName,
          community_platform_category_id: categoryId,
          description: RandomGenerator.paragraph({ sentences: 8 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert<ICommunityPlatformCommunity>(community);

  // Create post as A
  const post =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      {
        communityId: community.id,
        body: {
          title: RandomGenerator.paragraph({ sentences: 6 }),
          body: RandomGenerator.content({
            paragraphs: 2,
            sentenceMin: 6,
            sentenceMax: 12,
          }),
          author_display_name: null,
        } satisfies ICommunityPlatformPost.ICreate,
      },
    );
  typia.assert<ICommunityPlatformPost>(post);

  // Create comment as A
  const comment =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      connection,
      {
        postId: post.id,
        body: {
          content: RandomGenerator.paragraph({ sentences: 12 }),
          parent_id: null,
        } satisfies ICommunityPlatformComment.ICreate,
      },
    );
  typia.assert<ICommunityPlatformComment>(comment);

  // 3) Join User C and create their vote (Downvote)
  const userC = await api.functional.auth.communityMember.join(connection, {
    body: {
      username: randomUsername(),
      email: randomEmail(),
      password: randomPassword(),
    } satisfies ICommunityPlatformCommunityMember.ICreate,
  });
  typia.assert<ICommunityPlatformCommunityMember.IAuthorized>(userC);

  const voteC =
    await api.functional.communityPlatform.communityMember.comments.votes.update(
      connection,
      {
        commentId: comment.id,
        body: {
          state: "Downvote",
        } satisfies ICommunityPlatformCommentVote.IUpdate,
      },
    );
  typia.assert<ICommunityPlatformCommentVote>(voteC);
  TestValidator.equals(
    "C's vote points to the comment",
    voteC.community_platform_comment_id,
    comment.id,
  );

  // 4) Join User B, vote Upvote, then clear
  const userB = await api.functional.auth.communityMember.join(connection, {
    body: {
      username: randomUsername(),
      email: randomEmail(),
      password: randomPassword(),
    } satisfies ICommunityPlatformCommunityMember.ICreate,
  });
  typia.assert<ICommunityPlatformCommunityMember.IAuthorized>(userB);

  const voteB =
    await api.functional.communityPlatform.communityMember.comments.votes.update(
      connection,
      {
        commentId: comment.id,
        body: {
          state: "Upvote",
        } satisfies ICommunityPlatformCommentVote.IUpdate,
      },
    );
  typia.assert<ICommunityPlatformCommentVote>(voteB);
  TestValidator.equals(
    "B's vote points to the comment",
    voteB.community_platform_comment_id,
    comment.id,
  );
  TestValidator.notEquals(
    "B and C are different voters",
    voteB.community_platform_user_id,
    voteC.community_platform_user_id,
  );

  // Clear B's vote
  await api.functional.communityPlatform.communityMember.comments.votes.erase(
    connection,
    { commentId: comment.id },
  );

  // 5) B re-votes (Downvote) after clearing
  const voteBAfter =
    await api.functional.communityPlatform.communityMember.comments.votes.update(
      connection,
      {
        commentId: comment.id,
        body: {
          state: "Downvote",
        } satisfies ICommunityPlatformCommentVote.IUpdate,
      },
    );
  typia.assert<ICommunityPlatformCommentVote>(voteBAfter);
  TestValidator.equals(
    "B's re-vote applies requested state",
    voteBAfter.state,
    "Downvote" as IECommunityPlatformCommentVoteState,
  );
  TestValidator.equals(
    "B's re-vote remains linked to the same comment",
    voteBAfter.community_platform_comment_id,
    comment.id,
  );
}
