import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IClientContext } from "@ORGANIZATION/PROJECT-api/lib/structures/IClientContext";
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
 * Prevent authors from voting on their own posts and validate that another user
 * can vote normally.
 *
 * Business context:
 *
 * - Authors must not be able to vote (upvote/downvote) on their own posts.
 * - A different user can vote, and the outcome should reflect updated score and
 *   caller’s myVote state.
 *
 * Steps:
 *
 * 1. Join as User A (author)
 * 2. Create a community (owned by User A)
 * 3. Create a post in that community as User A and verify initial score is 0
 * 4. Attempt to upvote the post as User A (expect error; do not assert
 *    status/message)
 * 5. Join as User B (switch session)
 * 6. Upvote the post as User B and verify outcome: postId matches, myVote is
 *    "UPVOTE", score is 1
 */
export async function test_api_post_vote_self_vote_prevention(
  connection: api.IConnection,
) {
  // 1) Join as User A (author)
  const joinBodyA = {
    email: typia.random<string & tags.Format<"email">>(),
    username: `userA_${RandomGenerator.alphaNumeric(8)}`,
    password: `pw-${RandomGenerator.alphaNumeric(12)}`,
  } satisfies ICommunityPlatformRegisteredMember.IJoin;
  const userA = await api.functional.auth.registeredMember.join(connection, {
    body: joinBodyA,
  });
  typia.assert(userA);

  // 2) Create a community (owned by User A)
  const communityName = `c${RandomGenerator.alphaNumeric(10)}`; // starts with alpha, total length 11 (3-30 allowed)
  const communityBody = {
    name: communityName,
    category: typia.random<IECommunityCategory>(),
    description: RandomGenerator.paragraph({ sentences: 8 }),
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      { body: communityBody },
    );
  typia.assert(community);

  // 3) Create a post in that community as User A; confirm initial score is 0
  const postBody = {
    communityName: community.name,
    title: RandomGenerator.paragraph({ sentences: 5, wordMin: 4, wordMax: 8 }),
    body: RandomGenerator.content({
      paragraphs: 2,
      sentenceMin: 12,
      sentenceMax: 18,
      wordMin: 3,
      wordMax: 7,
    }),
  } satisfies ICommunityPlatformPost.ICreate;
  const post =
    await api.functional.communityPlatform.registeredMember.posts.create(
      connection,
      { body: postBody },
    );
  typia.assert(post);
  TestValidator.equals("initial post score is 0", post.score, 0);

  // 4) Attempt to upvote the post as User A (self-vote) and expect an error
  const upvoteBody = {
    state: "UPVOTE",
  } satisfies ICommunityPlatformPostVote.IUpdate;
  await TestValidator.error(
    "self-vote by author must be rejected",
    async () => {
      await api.functional.communityPlatform.registeredMember.posts.vote.update(
        connection,
        { postId: post.id, body: upvoteBody },
      );
    },
  );

  // 5) Join as User B (switch session)
  const joinBodyB = {
    email: typia.random<string & tags.Format<"email">>(),
    username: `userB_${RandomGenerator.alphaNumeric(8)}`,
    password: `pw-${RandomGenerator.alphaNumeric(12)}`,
  } satisfies ICommunityPlatformRegisteredMember.IJoin;
  const userB = await api.functional.auth.registeredMember.join(connection, {
    body: joinBodyB,
  });
  typia.assert(userB);

  // 6) Upvote as User B; verify outcome reflects correct state
  const outcome =
    await api.functional.communityPlatform.registeredMember.posts.vote.update(
      connection,
      { postId: post.id, body: upvoteBody },
    );
  typia.assert(outcome);
  TestValidator.equals(
    "vote outcome postId matches target post",
    outcome.postId,
    post.id,
  );
  TestValidator.equals(
    "myVote after upvote is UPVOTE",
    outcome.myVote,
    "UPVOTE",
  );
  TestValidator.equals(
    "score is 1 after single upvote by another user",
    outcome.score,
    1,
  );
}
