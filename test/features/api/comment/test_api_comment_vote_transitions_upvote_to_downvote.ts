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

export async function test_api_comment_vote_transitions_upvote_to_downvote(
  connection: api.IConnection,
) {
  // 1) Join as User A (author)
  const userA = await api.functional.auth.registeredMember.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      username: `user_${RandomGenerator.alphaNumeric(8)}`,
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ICommunityPlatformRegisteredMember.IJoin,
  });
  typia.assert(userA);

  // 2) Create a community
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
  const communityName: string = `e2e_${RandomGenerator.alphaNumeric(8)}`; // valid: starts/ends alphanumeric, underscores allowed
  const community =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      {
        body: {
          name: communityName,
          category: RandomGenerator.pick(categories),
          description: RandomGenerator.paragraph({ sentences: 8 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);
  TestValidator.equals(
    "community name echoes input",
    community.name,
    communityName,
  );

  // 3) Create a post in that community
  const post =
    await api.functional.communityPlatform.registeredMember.posts.create(
      connection,
      {
        body: {
          communityName: community.name,
          title: RandomGenerator.paragraph({ sentences: 6 }),
          body: RandomGenerator.content({
            paragraphs: 1,
            sentenceMin: 12,
            sentenceMax: 24,
          }),
        } satisfies ICommunityPlatformPost.ICreate,
      },
    );
  typia.assert(post);
  TestValidator.equals(
    "post community matches",
    post.community.name,
    community.name,
  );

  // 4) Create a comment under the post (author = User A)
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
  TestValidator.equals("comment belongs to the post", comment.postId, post.id);

  // 5) Join as User B (voter) — switches authenticated context
  const userB = await api.functional.auth.registeredMember.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      username: `user_${RandomGenerator.alphaNumeric(8)}`,
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ICommunityPlatformRegisteredMember.IJoin,
  });
  typia.assert(userB);

  // 6) User B applies UPVOTE (None -> UPVOTE)
  const upOutcome =
    await api.functional.communityPlatform.registeredMember.comments.vote.update(
      connection,
      {
        commentId: comment.id,
        body: {
          state: "UPVOTE",
        } satisfies ICommunityPlatformCommentVote.IUpdate,
      },
    );
  typia.assert(upOutcome);
  TestValidator.equals(
    "UPVOTE outcome targets the comment",
    upOutcome.commentId,
    comment.id,
  );
  TestValidator.equals("myVote becomes UPVOTE", upOutcome.myVote, "UPVOTE");
  const s1 = upOutcome.score;

  // 7) User B switches to DOWNVOTE (UPVOTE -> DOWNVOTE), score delta -2
  const downOutcome =
    await api.functional.communityPlatform.registeredMember.comments.vote.update(
      connection,
      {
        commentId: comment.id,
        body: {
          state: "DOWNVOTE",
        } satisfies ICommunityPlatformCommentVote.IUpdate,
      },
    );
  typia.assert(downOutcome);
  TestValidator.equals(
    "DOWNVOTE outcome targets the comment",
    downOutcome.commentId,
    comment.id,
  );
  TestValidator.equals(
    "myVote becomes DOWNVOTE",
    downOutcome.myVote,
    "DOWNVOTE",
  );
  TestValidator.equals(
    "score reflects -2 delta from +1 to -1",
    downOutcome.score,
    s1 - 2,
  );
}
