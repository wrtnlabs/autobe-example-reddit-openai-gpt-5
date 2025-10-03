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
 * Prevent authors from voting on their own comments.
 *
 * Business context:
 *
 * - Voting requires authentication and prohibits self-voting on own content.
 *
 * Steps:
 *
 * 1. User A registers (join) and becomes authenticated automatically by SDK.
 * 2. User A creates a community with a valid immutable name and a permitted
 *    category.
 * 3. User A creates a post in that community (title/body within constraints).
 * 4. User A creates a comment under the post (content within constraints).
 * 5. User A attempts to UPVOTE their own comment.
 *
 *    - Expectation: the operation fails (self-vote prevention). Only error existence
 *         is validated without asserting status code or message.
 */
export async function test_api_comment_vote_self_vote_prevented(
  connection: api.IConnection,
) {
  // 1) Register User A (authenticated by SDK on success)
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const username: string = `user_${RandomGenerator.alphaNumeric(12)}`;
  const password: string = `P@ssw0rd-${RandomGenerator.alphaNumeric(12)}`;

  const auth = await api.functional.auth.registeredMember.join(connection, {
    body: {
      email,
      username,
      password,
    } satisfies ICommunityPlatformRegisteredMember.IJoin,
  });
  typia.assert(auth);

  // 2) Create a community (valid name pattern, category required)
  const communityName: string = `e2e_${RandomGenerator.alphaNumeric(12)}`; // starts/ends alnum, includes underscore
  const community =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      {
        body: {
          name: communityName,
          category: typia.random<IECommunityCategory>(),
          description: RandomGenerator.paragraph({ sentences: 10 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);

  // 3) Create a post in the community
  const postTitle: string = RandomGenerator.paragraph({ sentences: 6 }); // 5–120 chars
  const postBody: string = RandomGenerator.content({
    paragraphs: 1,
    sentenceMin: 10,
    sentenceMax: 15,
    wordMin: 3,
    wordMax: 8,
  }); // 10–10,000 chars

  const post =
    await api.functional.communityPlatform.registeredMember.posts.create(
      connection,
      {
        body: {
          communityName,
          title: postTitle,
          body: postBody,
        } satisfies ICommunityPlatformPost.ICreate,
      },
    );
  typia.assert(post);

  // 4) Create a comment authored by User A under the post
  const commentContent: string = RandomGenerator.paragraph({ sentences: 8 }); // 2–2,000 chars
  const comment =
    await api.functional.communityPlatform.registeredMember.posts.comments.create(
      connection,
      {
        postId: post.id,
        body: {
          content: commentContent,
        } satisfies ICommunityPlatformComment.ICreate,
      },
    );
  typia.assert(comment);

  // 5) Attempt to upvote own comment -> must fail (self-vote prevention)
  await TestValidator.error(
    "author cannot vote their own comment",
    async () => {
      await api.functional.communityPlatform.registeredMember.comments.vote.update(
        connection,
        {
          commentId: comment.id,
          body: {
            state: "UPVOTE",
          } satisfies ICommunityPlatformCommentVote.IUpdate,
        },
      );
    },
  );
}
