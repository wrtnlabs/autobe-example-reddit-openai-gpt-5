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
 * Validate comment vote business rules and type-safe workflow.
 *
 * Rationale for scenario rewrite:
 *
 * - The vote update DTO (ICommunityPlatformCommentVote.IUpdate) strictly requires
 *   `state` ∈ {"Upvote", "Downvote"}. Sending an invalid literal (e.g., "Like")
 *   is impossible without violating type-safety, and such tests are forbidden.
 *
 * Test journey:
 *
 * 1. Register User A and remain authenticated.
 * 2. Read categories and choose one for community creation.
 * 3. Create a community, then a post, then a comment as User A.
 * 4. Attempt to self-vote as User A and validate rejection (business rule).
 * 5. Register User B (switches authentication) and create a valid Upvote on the
 *    comment.
 * 6. Toggle the vote to Downvote and validate state transition and identity
 *    stability.
 */
export async function test_api_comment_vote_invalid_state_rejected(
  connection: api.IConnection,
) {
  // 1) Register User A (author)
  const authA: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(connection, {
      body: typia.random<ICommunityPlatformCommunityMember.ICreate>(),
    });
  typia.assert(authA);

  // 2) Read categories to obtain a valid category id
  const categories: IPageICommunityPlatformCategory.ISummary =
    await api.functional.communityPlatform.categories.index(connection, {
      body: {} satisfies ICommunityPlatformCategory.IRequest,
    });
  typia.assert(categories);
  await TestValidator.predicate(
    "at least one category exists to create community",
    async () => categories.data.length > 0,
  );
  const category = categories.data[0];

  // 3) Create community as User A
  const communityCreateBase =
    typia.random<ICommunityPlatformCommunity.ICreate>();
  const community: ICommunityPlatformCommunity =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      {
        body: {
          ...communityCreateBase,
          community_platform_category_id: category.id,
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);

  // 4) Create a post in the community as User A
  const post: ICommunityPlatformPost =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      {
        communityId: community.id,
        body: typia.random<ICommunityPlatformPost.ICreate>(),
      },
    );
  typia.assert(post);

  // 5) Create a comment on the post as User A
  const comment: ICommunityPlatformComment =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      connection,
      {
        postId: post.id,
        body: typia.random<ICommunityPlatformComment.ICreate>(),
      },
    );
  typia.assert(comment);

  // 6) Self-vote must be rejected (business rule): User A cannot vote own comment
  await TestValidator.error(
    "author cannot vote on their own comment",
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

  // 7) Register User B to switch authentication context
  const authB: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(connection, {
      body: typia.random<ICommunityPlatformCommunityMember.ICreate>(),
    });
  typia.assert(authB);

  // 8) As User B, Upvote the comment successfully
  const upvote: ICommunityPlatformCommentVote =
    await api.functional.communityPlatform.communityMember.comments.votes.update(
      connection,
      {
        commentId: comment.id,
        body: {
          state: "Upvote",
        } satisfies ICommunityPlatformCommentVote.IUpdate,
      },
    );
  typia.assert(upvote);
  TestValidator.equals(
    "vote targets the correct comment",
    upvote.community_platform_comment_id,
    comment.id,
  );
  TestValidator.notEquals(
    "voter must not be the author",
    upvote.community_platform_user_id,
    authA.id,
  );
  TestValidator.equals("vote state stored as Upvote", upvote.state, "Upvote");

  // 9) Toggle vote to Downvote and validate state transition & same record id
  const downvote: ICommunityPlatformCommentVote =
    await api.functional.communityPlatform.communityMember.comments.votes.update(
      connection,
      {
        commentId: comment.id,
        body: {
          state: "Downvote",
        } satisfies ICommunityPlatformCommentVote.IUpdate,
      },
    );
  typia.assert(downvote);
  TestValidator.equals(
    "vote record identity remains the same for the (comment,user) pair",
    downvote.id,
    upvote.id,
  );
  TestValidator.equals(
    "vote state changed to Downvote",
    downvote.state,
    "Downvote",
  );
}
