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
 * Validate post vote state transitions and score deltas for a non-author voter.
 *
 * Business flow:
 *
 * 1. Join User A (author)
 * 2. Create a community
 * 3. Create a post under that community
 * 4. Join User B (voter) to switch session
 * 5. As User B, perform vote transitions using PUT:
 *
 *    - None -> UPVOTE (expect +1, myVote=UPVOTE)
 *    - UPVOTE -> UPVOTE (idempotent, no score change)
 *    - UPVOTE -> DOWNVOTE (expect -2, myVote=DOWNVOTE)
 *    - DOWNVOTE -> DOWNVOTE (idempotent, no score change)
 *    - DOWNVOTE -> UPVOTE (expect +2, myVote=UPVOTE)
 *
 * Notes:
 *
 * - The DELETE endpoint for clearing to NONE is not available in the provided API
 *   list, so we validate idempotency instead of None transitions.
 * - Tokens are handled by the SDK; calling join updates the Authorization header.
 */
export async function test_api_post_vote_state_transitions(
  connection: api.IConnection,
) {
  // 1) Join User A (author)
  const joinABody = {
    email: typia.random<string & tags.Format<"email">>(),
    username: `author_${RandomGenerator.alphaNumeric(10)}`,
    password: `Pw_${RandomGenerator.alphaNumeric(12)}`,
    displayName: RandomGenerator.name(1),
  } satisfies ICommunityPlatformRegisteredMember.IJoin;
  const userA = await api.functional.auth.registeredMember.join(connection, {
    body: joinABody,
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
  const communityName: string = `e2e_${RandomGenerator.alphaNumeric(12)}`; // matches pattern and uniqueness
  const community =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      {
        body: {
          name: communityName,
          category: RandomGenerator.pick(categories) as IECommunityCategory,
          description: RandomGenerator.paragraph({ sentences: 12 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);

  // 3) Create a post under that community
  const post =
    await api.functional.communityPlatform.registeredMember.posts.create(
      connection,
      {
        body: {
          communityName,
          title: RandomGenerator.paragraph({ sentences: 6 }),
          body: RandomGenerator.content({
            paragraphs: 2,
            sentenceMin: 12,
            sentenceMax: 20,
            wordMin: 3,
            wordMax: 8,
          }),
        } satisfies ICommunityPlatformPost.ICreate,
      },
    );
  typia.assert(post);
  const initialScore: number = post.score;

  // 4) Join User B (voter) to switch session
  const joinBBody = {
    email: typia.random<string & tags.Format<"email">>(),
    username: `voter_${RandomGenerator.alphaNumeric(10)}`,
    password: `Pw_${RandomGenerator.alphaNumeric(12)}`,
    displayName: RandomGenerator.name(1),
  } satisfies ICommunityPlatformRegisteredMember.IJoin;
  const userB = await api.functional.auth.registeredMember.join(connection, {
    body: joinBBody,
  });
  typia.assert(userB);

  // 5-a) None -> UPVOTE
  const up1 =
    await api.functional.communityPlatform.registeredMember.posts.vote.update(
      connection,
      {
        postId: post.id,
        body: { state: "UPVOTE" } satisfies ICommunityPlatformPostVote.IUpdate,
      },
    );
  typia.assert(up1);
  TestValidator.equals("UPVOTE sets myVote to UPVOTE", up1.myVote, "UPVOTE");
  TestValidator.equals(
    "UPVOTE increases score by +1",
    up1.score,
    initialScore + 1,
  );
  TestValidator.equals(
    "postId in outcome matches target post",
    up1.postId,
    post.id,
  );

  // 5-b) UPVOTE -> UPVOTE (idempotency)
  const up2 =
    await api.functional.communityPlatform.registeredMember.posts.vote.update(
      connection,
      {
        postId: post.id,
        body: { state: "UPVOTE" } satisfies ICommunityPlatformPostVote.IUpdate,
      },
    );
  typia.assert(up2);
  TestValidator.equals(
    "Idempotent UPVOTE keeps myVote UPVOTE",
    up2.myVote,
    "UPVOTE",
  );
  TestValidator.equals(
    "Idempotent UPVOTE keeps score unchanged",
    up2.score,
    up1.score,
  );

  // 5-c) UPVOTE -> DOWNVOTE (expect -2)
  const down1 =
    await api.functional.communityPlatform.registeredMember.posts.vote.update(
      connection,
      {
        postId: post.id,
        body: {
          state: "DOWNVOTE",
        } satisfies ICommunityPlatformPostVote.IUpdate,
      },
    );
  typia.assert(down1);
  TestValidator.equals(
    "DOWNVOTE sets myVote to DOWNVOTE",
    down1.myVote,
    "DOWNVOTE",
  );
  TestValidator.equals(
    "UPVOTE→DOWNVOTE decreases score by 2",
    down1.score,
    up1.score - 2,
  );

  // 5-d) DOWNVOTE -> DOWNVOTE (idempotency)
  const down2 =
    await api.functional.communityPlatform.registeredMember.posts.vote.update(
      connection,
      {
        postId: post.id,
        body: {
          state: "DOWNVOTE",
        } satisfies ICommunityPlatformPostVote.IUpdate,
      },
    );
  typia.assert(down2);
  TestValidator.equals(
    "Idempotent DOWNVOTE keeps myVote DOWNVOTE",
    down2.myVote,
    "DOWNVOTE",
  );
  TestValidator.equals(
    "Idempotent DOWNVOTE keeps score unchanged",
    down2.score,
    down1.score,
  );

  // 5-e) DOWNVOTE -> UPVOTE (expect +2)
  const up3 =
    await api.functional.communityPlatform.registeredMember.posts.vote.update(
      connection,
      {
        postId: post.id,
        body: { state: "UPVOTE" } satisfies ICommunityPlatformPostVote.IUpdate,
      },
    );
  typia.assert(up3);
  TestValidator.equals(
    "DOWNVOTE→UPVOTE increases score by 2",
    up3.score,
    down2.score + 2,
  );
  TestValidator.equals("Final myVote is UPVOTE", up3.myVote, "UPVOTE");
}
