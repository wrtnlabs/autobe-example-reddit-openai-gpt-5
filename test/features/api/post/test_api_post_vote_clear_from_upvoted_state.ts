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
 * Clear a previously set UPVOTE on a post (and validate guard and idempotency).
 *
 * Business workflow
 *
 * 1. Author joins, creates a community, and creates a post → capture baseline
 *    score
 * 2. Voter joins and applies an UPVOTE via PUT → verify myVote=UPVOTE and score =
 *    baseline + 1
 * 3. Unauthenticated guard: attempt DELETE vote using a fresh connection without
 *    headers → expect error
 * 4. Authenticated DELETE vote (clear to NONE)
 * 5. Idempotency: calling DELETE again still succeeds (no change)
 * 6. Re-apply UPVOTE and verify outcome again (myVote=UPVOTE, score returns to
 *    baseline + 1)
 *
 * Note: No read endpoint is provided for post detail; reconciliation after
 * DELETE is performed by re-applying UPVOTE and checking the returned outcome.
 * This respects available APIs and validates expected business effects.
 */
export async function test_api_post_vote_clear_from_upvoted_state(
  connection: api.IConnection,
) {
  // Helper to join a new registered member (SDK will set Authorization automatically)
  const joinMember =
    async (): Promise<ICommunityPlatformRegisteredMember.IAuthorized> => {
      const output = await api.functional.auth.registeredMember.join(
        connection,
        {
          body: {
            email: typia.random<string & tags.Format<"email">>(),
            username: RandomGenerator.name(1),
            password: `P@ssw0rd${RandomGenerator.alphaNumeric(8)}`,
            displayName: RandomGenerator.name(1),
          } satisfies ICommunityPlatformRegisteredMember.IJoin,
        },
      );
      typia.assert(output);
      return output;
    };

  // 1) Author joins and prepares data (community + post)
  const author = await joinMember();
  typia.assert(author);

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
  const communityName: string = `c_${RandomGenerator.alphabets(6)}_${RandomGenerator.alphabets(3)}`; // matches required pattern

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
            sentenceMax: 18,
            wordMin: 3,
            wordMax: 10,
          }),
          authorDisplayName: RandomGenerator.name(1),
        } satisfies ICommunityPlatformPost.ICreate,
      },
    );
  typia.assert(post);
  const baselineScore: number = post.score;

  // 2) Voter joins and applies UPVOTE (None -> UPVOTE)
  const voter = await joinMember();
  typia.assert(voter);

  const upOutcome =
    await api.functional.communityPlatform.registeredMember.posts.vote.update(
      connection,
      {
        postId: post.id,
        body: {
          state: "UPVOTE",
        } satisfies ICommunityPlatformPostVote.IUpdate,
      },
    );
  typia.assert(upOutcome);
  TestValidator.equals(
    "vote.update returns outcome for the correct post",
    upOutcome.postId,
    post.id,
  );
  TestValidator.equals(
    "score increased by +1 after UPVOTE",
    upOutcome.score,
    baselineScore + 1,
  );
  TestValidator.equals(
    "myVote is UPVOTE after PUT",
    upOutcome.myVote,
    "UPVOTE",
  );

  // 3) Unauthenticated guard: DELETE should fail without Authorization
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "unauthenticated user cannot clear vote",
    async () => {
      await api.functional.communityPlatform.registeredMember.posts.vote.erase(
        unauthConn,
        {
          postId: post.id,
        },
      );
    },
  );

  // 4) Authenticated DELETE (UPVOTE -> NONE)
  await api.functional.communityPlatform.registeredMember.posts.vote.erase(
    connection,
    {
      postId: post.id,
    },
  );

  // 5) Idempotency: subsequent DELETE still succeeds (no-op)
  await api.functional.communityPlatform.registeredMember.posts.vote.erase(
    connection,
    {
      postId: post.id,
    },
  );

  // 6) Re-apply UPVOTE to confirm neutral state and effect
  const reUpOutcome =
    await api.functional.communityPlatform.registeredMember.posts.vote.update(
      connection,
      {
        postId: post.id,
        body: {
          state: "UPVOTE",
        } satisfies ICommunityPlatformPostVote.IUpdate,
      },
    );
  typia.assert(reUpOutcome);
  TestValidator.equals(
    "re-upvote returns outcome for the same post",
    reUpOutcome.postId,
    post.id,
  );
  TestValidator.equals(
    "score returns to baseline + 1 after re-UPVOTE",
    reUpOutcome.score,
    baselineScore + 1,
  );
  TestValidator.equals(
    "myVote is UPVOTE after re-apply",
    reUpOutcome.myVote,
    "UPVOTE",
  );

  // Clean up: clear vote again to leave state at NONE
  await api.functional.communityPlatform.registeredMember.posts.vote.erase(
    connection,
    {
      postId: post.id,
    },
  );
}
