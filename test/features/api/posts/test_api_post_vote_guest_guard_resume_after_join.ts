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
 * Guest guard for post voting with resume-after-join.
 *
 * Purpose
 *
 * - Ensure unauthenticated users cannot vote on posts.
 * - After joining (authenticating) as a new member, retry the vote successfully.
 *
 * Steps
 *
 * 1. Join as User A (author) to obtain an authenticated session.
 * 2. Create a community with a valid, unique name and allowed category.
 * 3. Create a post in that community and capture its initial score.
 * 4. Attempt to vote with an unauthenticated connection (expect error).
 * 5. Join as User B (voter), switching the connection to User B session.
 * 6. Retry voting as User B and validate outcome fields:
 *
 *    - PostId matches
 *    - MyVote is UPVOTE
 *    - Score increased by 1 from initial
 */
export async function test_api_post_vote_guest_guard_resume_after_join(
  connection: api.IConnection,
) {
  // 1) Join as User A (author)
  const userAEmail: string = typia.random<string & tags.Format<"email">>();
  const userA: ICommunityPlatformRegisteredMember.IAuthorized =
    await api.functional.auth.registeredMember.join(connection, {
      body: {
        email: userAEmail,
        username: `author_${RandomGenerator.alphaNumeric(10)}`,
        password: `P${RandomGenerator.alphaNumeric(11)}`,
      } satisfies ICommunityPlatformRegisteredMember.IJoin,
    });
  typia.assert(userA);

  // 2) Create a community (valid name and category)
  const communityName: string = `e2e-${RandomGenerator.alphaNumeric(12)}`;
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
  const category = RandomGenerator.pick(categories);

  const community: ICommunityPlatformCommunity =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      {
        body: {
          name: communityName,
          category: category,
          description: RandomGenerator.paragraph({ sentences: 8 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);

  // 3) Create a post in the community
  const postTitle = RandomGenerator.paragraph({ sentences: 6 });
  const postBody = RandomGenerator.content({
    paragraphs: 1,
    sentenceMin: 12,
    sentenceMax: 18,
    wordMin: 4,
    wordMax: 10,
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
  const initialScore: number = post.score satisfies number as number;

  // 4) Attempt to vote as guest (unauthenticated connection)
  const unauth: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "guest cannot vote; must sign in first",
    async () => {
      await api.functional.communityPlatform.registeredMember.posts.vote.update(
        unauth,
        {
          postId: post.id,
          body: {
            state: "UPVOTE",
          } satisfies ICommunityPlatformPostVote.IUpdate,
        },
      );
    },
  );

  // 5) Join as User B (voter) - this switches the connection auth context
  const userBEmail: string = typia.random<string & tags.Format<"email">>();
  const userB: ICommunityPlatformRegisteredMember.IAuthorized =
    await api.functional.auth.registeredMember.join(connection, {
      body: {
        email: userBEmail,
        username: `voter_${RandomGenerator.alphaNumeric(10)}`,
        password: `P${RandomGenerator.alphaNumeric(11)}`,
      } satisfies ICommunityPlatformRegisteredMember.IJoin,
    });
  typia.assert(userB);

  // 6) Retry voting as authenticated User B
  const outcome: ICommunityPlatformPostVoteOutcome =
    await api.functional.communityPlatform.registeredMember.posts.vote.update(
      connection,
      {
        postId: post.id,
        body: {
          state: "UPVOTE",
        } satisfies ICommunityPlatformPostVote.IUpdate,
      },
    );
  typia.assert(outcome);

  // Validate outcome fields
  TestValidator.equals(
    "vote outcome targets the created post",
    outcome.postId,
    post.id,
  );
  TestValidator.equals(
    "myVote is UPVOTE after voting",
    outcome.myVote,
    "UPVOTE",
  );
  TestValidator.equals(
    "score increased by 1 after upvote",
    outcome.score,
    (initialScore + 1) satisfies number as number,
  );
}
