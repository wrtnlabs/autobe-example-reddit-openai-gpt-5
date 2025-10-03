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
 * Clear an existing UPVOTE on a comment and verify transitions & idempotency.
 *
 * Business flow:
 *
 * 1. Author setup (User A): join, create community, create post, create comment.
 * 2. Voter (User B): join and UPVOTE the comment; verify outcome (score=+1,
 *    myVote=UPVOTE).
 * 3. Clear vote via DELETE; expect success (void).
 * 4. Re-apply UPVOTE to confirm the vote was cleared cleanly (score back to +1).
 *    Then perform two successive DELETE calls to confirm idempotency (both
 *    succeed).
 * 5. Apply DOWNVOTE to show fresh state after clearing (score=-1,
 *    myVote=DOWNVOTE).
 * 6. Guard: Unauthenticated DELETE must throw an error (no status/message
 *    inspection).
 *
 * Notes:
 *
 * - No dedicated read endpoint exists to fetch comment or vote state after
 *   DELETE, so we validate clearing by observing outcomes of subsequent PUT
 *   operations.
 * - All request bodies use `satisfies {Dto}` with `const` variables to ensure
 *   immutability and type safety; never use `as any` or omit required fields.
 */
export async function test_api_comment_vote_clear_from_upvoted_state(
  connection: api.IConnection,
) {
  // 1) Author (User A) joins
  const suffixA: string = RandomGenerator.alphaNumeric(8);
  const joinABody = {
    email: typia.random<string & tags.Format<"email">>(),
    username: `userA_${suffixA}`,
    password: `P@ssw0rd_${suffixA}`,
    displayName: RandomGenerator.name(2),
  } satisfies ICommunityPlatformRegisteredMember.IJoin;
  const authA = await api.functional.auth.registeredMember.join(connection, {
    body: joinABody,
  });
  typia.assert(authA);

  // Create community (A)
  const communityName: string = `c${RandomGenerator.alphaNumeric(6)}x`;
  const communityBody = {
    name: communityName,
    category: "Tech & Programming",
    description: RandomGenerator.paragraph({ sentences: 10 }),
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      { body: communityBody },
    );
  typia.assert(community);
  TestValidator.equals(
    "community created with requested name",
    community.name,
    communityName,
  );

  // Create post (A)
  const postBody = {
    communityName: community.name,
    title: RandomGenerator.paragraph({ sentences: 4 }),
    body: RandomGenerator.content({
      paragraphs: 2,
      sentenceMin: 8,
      sentenceMax: 15,
    }),
    authorDisplayName: RandomGenerator.name(1),
  } satisfies ICommunityPlatformPost.ICreate;
  const post =
    await api.functional.communityPlatform.registeredMember.posts.create(
      connection,
      { body: postBody },
    );
  typia.assert(post);
  TestValidator.equals(
    "post community name matches",
    post.community.name,
    community.name,
  );

  // Create comment (A)
  const commentBody = {
    content: RandomGenerator.paragraph({ sentences: 12 }),
  } satisfies ICommunityPlatformComment.ICreate;
  const comment =
    await api.functional.communityPlatform.registeredMember.posts.comments.create(
      connection,
      { postId: post.id, body: commentBody },
    );
  typia.assert(comment);
  TestValidator.equals("comment belongs to post", comment.postId, post.id);
  TestValidator.equals(
    "comment authored by user A",
    comment.authorId,
    authA.id,
  );

  // 2) Voter (User B) joins and upvotes the comment
  const suffixB: string = RandomGenerator.alphaNumeric(8);
  const joinBBody = {
    email: typia.random<string & tags.Format<"email">>(),
    username: `userB_${suffixB}`,
    password: `P@ssw0rd_${suffixB}`,
    displayName: RandomGenerator.name(2),
  } satisfies ICommunityPlatformRegisteredMember.IJoin;
  const authB = await api.functional.auth.registeredMember.join(connection, {
    body: joinBBody,
  });
  typia.assert(authB);

  const upvoteBody = {
    state: "UPVOTE",
  } satisfies ICommunityPlatformCommentVote.IUpdate;
  const upOutcome =
    await api.functional.communityPlatform.registeredMember.comments.vote.update(
      connection,
      { commentId: comment.id, body: upvoteBody },
    );
  typia.assert(upOutcome);
  TestValidator.equals(
    "vote outcome comment id matches",
    upOutcome.commentId,
    comment.id,
  );
  TestValidator.equals(
    "myVote becomes UPVOTE after PUT",
    upOutcome.myVote,
    "UPVOTE",
  );
  TestValidator.equals(
    "score becomes +1 after first upvote",
    upOutcome.score,
    1,
  );

  // 3) Clear vote via DELETE
  await api.functional.communityPlatform.registeredMember.comments.vote.erase(
    connection,
    { commentId: comment.id },
  );

  // 4) Re-apply UPVOTE to verify clean state after clearing
  const reUpOutcome =
    await api.functional.communityPlatform.registeredMember.comments.vote.update(
      connection,
      { commentId: comment.id, body: upvoteBody },
    );
  typia.assert(reUpOutcome);
  TestValidator.equals(
    "after clearing, re-upvote yields myVote=UPVOTE",
    reUpOutcome.myVote,
    "UPVOTE",
  );
  TestValidator.equals(
    "after clearing, re-upvote resets score to +1",
    reUpOutcome.score,
    1,
  );

  // Delete twice to confirm idempotency (both succeed)
  await api.functional.communityPlatform.registeredMember.comments.vote.erase(
    connection,
    { commentId: comment.id },
  );
  await api.functional.communityPlatform.registeredMember.comments.vote.erase(
    connection,
    { commentId: comment.id },
  );

  // Apply DOWNVOTE to demonstrate fresh state after idempotent clears
  const downvoteBody = {
    state: "DOWNVOTE",
  } satisfies ICommunityPlatformCommentVote.IUpdate;
  const downOutcome =
    await api.functional.communityPlatform.registeredMember.comments.vote.update(
      connection,
      { commentId: comment.id, body: downvoteBody },
    );
  typia.assert(downOutcome);
  TestValidator.equals(
    "after idempotent erases, new downvote yields -1",
    downOutcome.score,
    -1,
  );
  TestValidator.equals(
    "myVote becomes DOWNVOTE",
    downOutcome.myVote,
    "DOWNVOTE",
  );

  // 5) Guard: Unauthenticated DELETE must fail
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error("guest cannot clear vote on comment", async () => {
    await api.functional.communityPlatform.registeredMember.comments.vote.erase(
      unauthConn,
      { commentId: comment.id },
    );
  });
}
