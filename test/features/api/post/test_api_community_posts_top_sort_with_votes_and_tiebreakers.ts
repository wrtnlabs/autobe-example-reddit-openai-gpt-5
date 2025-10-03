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
import type { ICommunityRef } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityRef";
import type { IECommunityCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityCategory";
import type { IECommunityPlatformCommunityCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformCommunityCategory";
import type { IECommunityPlatformVoteState } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformVoteState";
import type { IEPostSort } from "@ORGANIZATION/PROJECT-api/lib/structures/IEPostSort";
import type { IEVoteDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IEVoteDirection";
import type { IEVoteState } from "@ORGANIZATION/PROJECT-api/lib/structures/IEVoteState";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformPost } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformPost";
import type { IUserRef } from "@ORGANIZATION/PROJECT-api/lib/structures/IUserRef";

/**
 * Validate Top sorting (score DESC, then createdAt DESC, then id DESC) for
 * community posts with multi-user voting shaping the scores.
 *
 * Steps:
 *
 * 1. Register User A (author) and create a new community with a valid, unique
 *    name.
 * 2. As User A, create three posts P1, P2, P3 in the community.
 * 3. Register User B and cast votes: UPVOTE P2 and UPVOTE P1.
 * 4. Register User C and cast votes: UPVOTE P2 (making score +2) and DOWNVOTE P3
 *    (making score -1).
 * 5. List posts in the community with sort = "top" and verify ordering [P2, P1,
 *    P3] and scores [2, 1, -1].
 */
export async function test_api_community_posts_top_sort_with_votes_and_tiebreakers(
  connection: api.IConnection,
) {
  // 1) User A joins (author)
  const emailA = typia.random<string & tags.Format<"email">>();
  const usernameA = RandomGenerator.alphabets(8);
  const passwordA = RandomGenerator.alphaNumeric(12);
  const authA = await api.functional.auth.registeredMember.join(connection, {
    body: {
      email: emailA,
      username: usernameA,
      password: passwordA,
    } satisfies ICommunityPlatformRegisteredMember.IJoin,
  });
  typia.assert(authA);

  // 2) Create a unique, valid community
  const communityName = `${RandomGenerator.alphabets(1)}${RandomGenerator.alphaNumeric(11)}`;
  const community =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      {
        body: {
          name: communityName,
          category: "Tech & Programming",
          description: RandomGenerator.paragraph({ sentences: 8 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);
  TestValidator.equals(
    "created community's name equals requested name",
    community.name,
    communityName,
  );

  // 3) Create three posts P1, P2, P3 as User A
  const createPost = async (label: string) => {
    const post =
      await api.functional.communityPlatform.registeredMember.posts.create(
        connection,
        {
          body: {
            communityName,
            title: `${label} ${RandomGenerator.paragraph({ sentences: 5 })}`,
            body: RandomGenerator.content({
              paragraphs: 2,
              sentenceMin: 8,
              sentenceMax: 14,
              wordMin: 3,
              wordMax: 8,
            }),
          } satisfies ICommunityPlatformPost.ICreate,
        },
      );
    typia.assert(post);
    TestValidator.equals(
      `post ${label} belongs to the created community`,
      post.community.name,
      communityName,
    );
    return post;
  };
  const p1 = await createPost("P1");
  const p2 = await createPost("P2");
  const p3 = await createPost("P3");

  // 4) User B joins and votes
  const emailB = typia.random<string & tags.Format<"email">>();
  const usernameB = RandomGenerator.alphabets(8);
  const passwordB = RandomGenerator.alphaNumeric(12);
  const authB = await api.functional.auth.registeredMember.join(connection, {
    body: {
      email: emailB,
      username: usernameB,
      password: passwordB,
    } satisfies ICommunityPlatformRegisteredMember.IJoin,
  });
  typia.assert(authB);

  // User B: UPVOTE P2
  const outcomeB_P2 =
    await api.functional.communityPlatform.registeredMember.posts.vote.update(
      connection,
      {
        postId: p2.id,
        body: { state: "UPVOTE" } satisfies ICommunityPlatformPostVote.IUpdate,
      },
    );
  typia.assert(outcomeB_P2);
  TestValidator.equals(
    "B upvote outcome targets P2",
    outcomeB_P2.postId,
    p2.id,
  );

  // User B: UPVOTE P1
  const outcomeB_P1 =
    await api.functional.communityPlatform.registeredMember.posts.vote.update(
      connection,
      {
        postId: p1.id,
        body: { state: "UPVOTE" } satisfies ICommunityPlatformPostVote.IUpdate,
      },
    );
  typia.assert(outcomeB_P1);
  TestValidator.equals(
    "B upvote outcome targets P1",
    outcomeB_P1.postId,
    p1.id,
  );

  // 5) User C joins and votes
  const emailC = typia.random<string & tags.Format<"email">>();
  const usernameC = RandomGenerator.alphabets(8);
  const passwordC = RandomGenerator.alphaNumeric(12);
  const authC = await api.functional.auth.registeredMember.join(connection, {
    body: {
      email: emailC,
      username: usernameC,
      password: passwordC,
    } satisfies ICommunityPlatformRegisteredMember.IJoin,
  });
  typia.assert(authC);

  // User C: UPVOTE P2 (score should become +2)
  const outcomeC_P2 =
    await api.functional.communityPlatform.registeredMember.posts.vote.update(
      connection,
      {
        postId: p2.id,
        body: { state: "UPVOTE" } satisfies ICommunityPlatformPostVote.IUpdate,
      },
    );
  typia.assert(outcomeC_P2);
  TestValidator.equals(
    "C upvote outcome targets P2",
    outcomeC_P2.postId,
    p2.id,
  );
  TestValidator.equals(
    "P2 score becomes +2 after two upvotes",
    outcomeC_P2.score,
    2 as number,
  );

  // User C: DOWNVOTE P3 (score should become -1)
  const outcomeC_P3 =
    await api.functional.communityPlatform.registeredMember.posts.vote.update(
      connection,
      {
        postId: p3.id,
        body: {
          state: "DOWNVOTE",
        } satisfies ICommunityPlatformPostVote.IUpdate,
      },
    );
  typia.assert(outcomeC_P3);
  TestValidator.equals(
    "C downvote outcome targets P3",
    outcomeC_P3.postId,
    p3.id,
  );
  TestValidator.equals(
    "P3 score becomes -1 after one downvote",
    outcomeC_P3.score,
    -1 as number,
  );

  // 6) Top-sorted community posts listing and validations
  const page = await api.functional.communityPlatform.communities.posts.index(
    connection,
    {
      communityName: communityName,
      body: {
        sort: "top",
        limit: 20,
      } satisfies ICommunityPlatformPost.IRequest,
    },
  );
  typia.assert(page);

  const items = page.data;
  const targetIds = new Set<string>([p1.id, p2.id, p3.id]);
  const orderedIds = items.filter((d) => targetIds.has(d.id)).map((d) => d.id);

  TestValidator.equals(
    "Top sort places posts in expected score order [P2, P1, P3]",
    orderedIds,
    [p2.id, p1.id, p3.id],
  );

  const s2 = items.find((d) => d.id === p2.id);
  const s1 = items.find((d) => d.id === p1.id);
  const s3 = items.find((d) => d.id === p3.id);
  typia.assertGuard(s2!);
  typia.assertGuard(s1!);
  typia.assertGuard(s3!);

  TestValidator.equals("P2 score == +2", s2.score, 2 as number);
  TestValidator.equals("P1 score == +1", s1.score, 1 as number);
  TestValidator.equals("P3 score == -1", s3.score, -1 as number);
}
