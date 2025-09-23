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

export async function test_api_comment_vote_set_upvote_on_others_comment_success(
  connection: api.IConnection,
) {
  /**
   * Validate that a community member (User B) can set an Upvote on another
   * user's (User A) comment and that the operation is idempotent.
   *
   * Steps:
   *
   * 1. Create two members with independent auth contexts (User A = author, User B
   *    = voter)
   * 2. Discover an active category
   * 3. As User A, create a community using the category
   * 4. As User A, create a post in the community
   * 5. As User A, create a top-level comment under the post
   * 6. As User B, set vote state to "Upvote" on the comment
   * 7. Re-submit Upvote to verify idempotency (no duplicate record, same state)
   */

  // Prepare independent authenticated connections for User A and User B
  const connA: api.IConnection = { ...connection, headers: {} };
  const connB: api.IConnection = { ...connection, headers: {} };

  // 1) Join User A (author)
  const userA = await api.functional.auth.communityMember.join(connA, {
    body: {
      username: `user_${RandomGenerator.alphaNumeric(8)}`,
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ICommunityPlatformCommunityMember.ICreate,
  });
  typia.assert(userA);

  // 1) Join User B (voter)
  const userB = await api.functional.auth.communityMember.join(connB, {
    body: {
      username: `user_${RandomGenerator.alphaNumeric(8)}`,
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ICommunityPlatformCommunityMember.ICreate,
  });
  typia.assert(userB);

  // Ensure users are distinct
  TestValidator.notEquals(
    "User A and User B must be different",
    userA.id,
    userB.id,
  );

  // 2) Discover an active category
  const categories = await api.functional.communityPlatform.categories.index(
    connA,
    {
      body: {
        page: 1,
        limit: 20,
        active: true,
        sortBy: "display_order",
        direction: "asc",
      } satisfies ICommunityPlatformCategory.IRequest,
    },
  );
  typia.assert(categories);
  TestValidator.predicate(
    "at least one active category should exist",
    categories.data.length > 0,
  );
  const category = categories.data[0];

  // 3) As User A, create a community
  const community =
    await api.functional.communityPlatform.communityMember.communities.create(
      connA,
      {
        body: {
          name: `c${RandomGenerator.alphaNumeric(12)}`,
          community_platform_category_id: category.id,
          description: RandomGenerator.paragraph({ sentences: 8 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);

  // 4) As User A, create a post in that community
  const post =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connA,
      {
        communityId: community.id,
        body: {
          title: RandomGenerator.paragraph({ sentences: 5 }),
          body: RandomGenerator.content({
            paragraphs: 1,
            sentenceMin: 12,
            sentenceMax: 20,
          }),
        } satisfies ICommunityPlatformPost.ICreate,
      },
    );
  typia.assert(post);

  // 5) As User A, create a top-level comment (parent_id = null)
  const comment =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      connA,
      {
        postId: post.id,
        body: {
          content: RandomGenerator.paragraph({ sentences: 12 }),
          parent_id: null,
        } satisfies ICommunityPlatformComment.ICreate,
      },
    );
  typia.assert(comment);

  // Verify comment author is User A and voter will be different (User B)
  TestValidator.equals(
    "comment author should be User A",
    comment.community_platform_user_id,
    userA.id,
  );
  TestValidator.notEquals(
    "voter (User B) must not be the author",
    comment.community_platform_user_id,
    userB.id,
  );

  // 6) As User B, set vote to "Upvote" on the comment
  const upvote1 =
    await api.functional.communityPlatform.communityMember.comments.votes.update(
      connB,
      {
        commentId: comment.id,
        body: {
          state: "Upvote",
        } satisfies ICommunityPlatformCommentVote.IUpdate,
      },
    );
  typia.assert(upvote1);

  // Business validations for first vote
  TestValidator.equals(
    "vote references the correct comment",
    upvote1.community_platform_comment_id,
    comment.id,
  );
  TestValidator.equals(
    "vote belongs to the voter (User B)",
    upvote1.community_platform_user_id,
    userB.id,
  );
  TestValidator.equals(
    'vote state is set to "Upvote"',
    upvote1.state,
    "Upvote",
  );

  // 7) Idempotency: calling Upvote again should not duplicate and should keep state
  const upvote2 =
    await api.functional.communityPlatform.communityMember.comments.votes.update(
      connB,
      {
        commentId: comment.id,
        body: {
          state: "Upvote",
        } satisfies ICommunityPlatformCommentVote.IUpdate,
      },
    );
  typia.assert(upvote2);

  TestValidator.equals(
    "idempotent Upvote keeps the same vote record id",
    upvote2.id,
    upvote1.id,
  );
  TestValidator.equals(
    "idempotent Upvote maintains state as Upvote",
    upvote2.state,
    "Upvote",
  );
}
