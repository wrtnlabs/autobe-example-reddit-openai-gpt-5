import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IClientContext } from "@ORGANIZATION/PROJECT-api/lib/structures/IClientContext";
import type { ICommentVoteUpdateState } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommentVoteUpdateState";
import type { ICommunityPlatformComment } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformComment";
import type { ICommunityPlatformCommentVote } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommentVote";
import type { ICommunityPlatformCommentVoteOutcome } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommentVoteOutcome";
import type { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";
import type { ICommunityPlatformCommunityRule } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityRule";
import type { ICommunityPlatformCommunityRuleArray } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityRuleArray";
import type { ICommunityPlatformPost } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformPost";
import type { ICommunityPlatformRegisteredMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRegisteredMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";
import type { IECommunityCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityCategory";
import type { IECommunityPlatformCommunityCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformCommunityCategory";
import type { IECommunityPlatformVoteState } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformVoteState";
import type { IVoteState } from "@ORGANIZATION/PROJECT-api/lib/structures/IVoteState";

/**
 * Guest-guard and resume flow for comment voting.
 *
 * This test validates that:
 *
 * 1. A guest (no Authorization header) attempting to upvote a comment is blocked
 *    by authentication guard (we only assert that an error occurs, not specific
 *    status/message per E2E policy).
 * 2. After signing in as a registered member (User B), retrying the same vote
 *    succeeds, returning updated score and myVote = "UPVOTE" with the correct
 *    commentId.
 *
 * Steps
 *
 * - User A joins (authoring context)
 * - Create community → create post → create comment
 * - Try voting as guest via unauthenticated connection clone → expect error
 * - User B joins (switches SDK token)
 * - Retry voting → success; validate outcome
 */
export async function test_api_comment_vote_guest_guard_and_resume(
  connection: api.IConnection,
) {
  // 1) User A joins (author)
  const userAEmail = typia.random<string & tags.Format<"email">>();
  const userAAuth = await api.functional.auth.registeredMember.join(
    connection,
    {
      body: {
        email: userAEmail,
        username: RandomGenerator.alphabets(10),
        password: RandomGenerator.alphaNumeric(12),
        displayName: RandomGenerator.name(1),
      } satisfies ICommunityPlatformRegisteredMember.IJoin,
    },
  );
  typia.assert(userAAuth);

  // 2) Create a community
  const communityName = `e2e${RandomGenerator.alphaNumeric(10)}`; // safe: alphanumeric, 3-30, starts/ends alnum
  const categories = [
    "Tech & Programming",
    "Science",
    "Movies & TV",
    "Games",
    "Sports",
    "Lifestyle & Wellness",
    "Study & Education",
    "Art & Design",
    "Business & Finance",
    "News & Current Affairs",
  ] as const;
  const community =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      {
        body: {
          name: communityName,
          category: RandomGenerator.pick(categories),
          description: RandomGenerator.paragraph({ sentences: 12 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);

  // 3) Create a post within that community
  const post =
    await api.functional.communityPlatform.registeredMember.posts.create(
      connection,
      {
        body: {
          communityName: community.name,
          title: RandomGenerator.paragraph({ sentences: 5 }),
          body: RandomGenerator.content({
            paragraphs: 1,
            sentenceMin: 10,
            sentenceMax: 20,
          }),
          authorDisplayName: RandomGenerator.name(1),
        } satisfies ICommunityPlatformPost.ICreate,
      },
    );
  typia.assert(post);

  // 4) Create a comment under the post
  const comment =
    await api.functional.communityPlatform.registeredMember.posts.comments.create(
      connection,
      {
        postId: post.id,
        body: {
          content: RandomGenerator.paragraph({ sentences: 12 }),
        } satisfies ICommunityPlatformComment.ICreate,
      },
    );
  typia.assert(comment);

  // 5) Guest attempt: clone unauthenticated connection and try to upvote → expect error
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "guest cannot vote on comments; requires sign-in",
    async () => {
      await api.functional.communityPlatform.registeredMember.comments.vote.update(
        unauthConn,
        {
          commentId: comment.id,
          body: {
            state: "UPVOTE",
          } satisfies ICommunityPlatformCommentVote.IUpdate,
        },
      );
    },
  );

  // 6) User B joins (resume after sign-in)
  const userBEmail = typia.random<string & tags.Format<"email">>();
  const userBAuth = await api.functional.auth.registeredMember.join(
    connection,
    {
      body: {
        email: userBEmail,
        username: RandomGenerator.alphabets(10),
        password: RandomGenerator.alphaNumeric(12),
        displayName: RandomGenerator.name(1),
      } satisfies ICommunityPlatformRegisteredMember.IJoin,
    },
  );
  typia.assert(userBAuth);

  // 7) Retry the same vote successfully
  const outcome =
    await api.functional.communityPlatform.registeredMember.comments.vote.update(
      connection,
      {
        commentId: comment.id,
        body: {
          state: "UPVOTE",
        } satisfies ICommunityPlatformCommentVote.IUpdate,
      },
    );
  typia.assert(outcome);

  // Validations: commentId match, myVote = UPVOTE, score >= 1
  TestValidator.equals(
    "vote outcome commentId matches target",
    outcome.commentId,
    comment.id,
  );
  TestValidator.equals(
    "myVote should be UPVOTE after voting",
    outcome.myVote,
    "UPVOTE",
  );
  TestValidator.predicate(
    "score should be at least 1 after first upvote",
    outcome.score >= 1,
  );
}
