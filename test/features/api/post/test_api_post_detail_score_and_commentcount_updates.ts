import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IClientContext } from "@ORGANIZATION/PROJECT-api/lib/structures/IClientContext";
import type { ICommunityPlatformComment } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformComment";
import type { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";
import type { ICommunityPlatformCommunityRule } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityRule";
import type { ICommunityPlatformCommunityRuleArray } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityRuleArray";
import type { ICommunityPlatformPost } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformPost";
import type { ICommunityPlatformPostVote } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformPostVote";
import type { ICommunityPlatformPostVoteOutcome } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformPostVoteOutcome";
import type { ICommunityPlatformRegisteredMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRegisteredMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";
import type { IECommunityCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityCategory";
import type { IECommunityPlatformCommunityCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformCommunityCategory";
import type { IECommunityPlatformVoteState } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformVoteState";
import type { IEVoteDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IEVoteDirection";
import type { IEVoteState } from "@ORGANIZATION/PROJECT-api/lib/structures/IEVoteState";

/**
 * Confirm Post Detail aggregates reflect voting and commenting.
 *
 * Steps:
 *
 * 1. Join member A (author).
 * 2. As A, create a community and a post; capture initial score/commentCount.
 * 3. Join member B (voter/commenter), then upvote A's post.
 * 4. Still as B, create two comments under the post.
 * 5. Using an unauthenticated connection, GET the post detail and validate that
 *    score and commentCount match the expected aggregates.
 */
export async function test_api_post_detail_score_and_commentcount_updates(
  connection: api.IConnection,
) {
  // 1) Join member A (author)
  const authorEmail: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const authorUsername: string = `author_${RandomGenerator.alphaNumeric(12)}`;
  const author: ICommunityPlatformRegisteredMember.IAuthorized =
    await api.functional.auth.registeredMember.join(connection, {
      body: {
        email: authorEmail,
        username: authorUsername,
        password: RandomGenerator.alphaNumeric(12),
        displayName: RandomGenerator.name(1),
      } satisfies ICommunityPlatformRegisteredMember.IJoin,
    });
  typia.assert(author);

  // 2) As A, create a community
  const communityName: string = `e2e-${RandomGenerator.alphaNumeric(16)}`; // starts with alpha, ends alnum, contains hyphen
  const community: ICommunityPlatformCommunity =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      {
        body: {
          name: communityName,
          category: "Tech & Programming",
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);

  // 2-2) As A, create a post in the community
  const postTitle: string = RandomGenerator.paragraph({ sentences: 6 }); // ~6 words, well within 5-120 chars
  const postBody: string = RandomGenerator.content({
    paragraphs: 1,
    sentenceMin: 12,
    sentenceMax: 18,
    wordMin: 3,
    wordMax: 8,
  });
  const post: ICommunityPlatformPost =
    await api.functional.communityPlatform.registeredMember.posts.create(
      connection,
      {
        body: {
          communityName: community.name,
          title: postTitle,
          body: postBody,
        } satisfies ICommunityPlatformPost.ICreate,
      },
    );
  typia.assert(post);

  const initialScore: number = post.score;
  const initialCommentCount: number = post.commentCount;

  // 3) Join member B (voter/commenter) - SDK switches Authorization automatically
  const voterEmail: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const voterUsername: string = `voter_${RandomGenerator.alphaNumeric(12)}`;
  const voter: ICommunityPlatformRegisteredMember.IAuthorized =
    await api.functional.auth.registeredMember.join(connection, {
      body: {
        email: voterEmail,
        username: voterUsername,
        password: RandomGenerator.alphaNumeric(12),
        displayName: RandomGenerator.name(1),
      } satisfies ICommunityPlatformRegisteredMember.IJoin,
    });
  typia.assert(voter);

  // 3-2) As B, upvote the post
  const voteOutcome: ICommunityPlatformPostVoteOutcome =
    await api.functional.communityPlatform.registeredMember.posts.vote.update(
      connection,
      {
        postId: post.id,
        body: {
          state: "UPVOTE",
        } satisfies ICommunityPlatformPostVote.IUpdate,
      },
    );
  typia.assert(voteOutcome);

  // 4) As B, create two comments under the post
  const comment1: ICommunityPlatformComment =
    await api.functional.communityPlatform.registeredMember.posts.comments.create(
      connection,
      {
        postId: post.id,
        body: {
          content: RandomGenerator.paragraph({ sentences: 8 }),
        } satisfies ICommunityPlatformComment.ICreate,
      },
    );
  typia.assert(comment1);

  const comment2: ICommunityPlatformComment =
    await api.functional.communityPlatform.registeredMember.posts.comments.create(
      connection,
      {
        postId: post.id,
        body: {
          content: RandomGenerator.paragraph({ sentences: 7 }),
        } satisfies ICommunityPlatformComment.ICreate,
      },
    );
  typia.assert(comment2);

  // 5) Public read (unauthenticated) and validations
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  const read: ICommunityPlatformPost =
    await api.functional.communityPlatform.posts.at(unauthConn, {
      postId: post.id,
    });
  typia.assert(read);

  // Sanity: same post id
  TestValidator.equals(
    "public read returns the same post id",
    read.id,
    post.id,
  );
  // Aggregates updated as expected
  TestValidator.equals(
    "score reflects one upvote from other user",
    read.score,
    initialScore + 1,
  );
  TestValidator.equals(
    "commentCount reflects two new comments",
    read.commentCount,
    initialCommentCount + 2,
  );
}
