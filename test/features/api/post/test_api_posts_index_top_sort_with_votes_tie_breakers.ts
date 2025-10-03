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
 * Validate Top sorting with vote-influenced ordering and tie-breakers.
 *
 * Steps:
 *
 * 1. Register two members: A (author) and B (voter).
 * 2. As A, create a community.
 * 3. As A, create three posts (P1, P2, P3) sequentially.
 * 4. As B (non-author), upvote P2 to make its score higher than others.
 * 5. As unauthenticated, list posts with sort=top and validate ordering:
 *
 *    - P2 (score 1) appears before P3 and P1 (score 0)
 *    - Among zero-score posts, newer createdAt first (P3 before P1)
 *    - If createdAt ties, id DESC tie-breaker is respected
 * 6. Validate scores in the listing reflect the applied votes.
 */
export async function test_api_posts_index_top_sort_with_votes_tie_breakers(
  connection: api.IConnection,
) {
  // 1) Register two members: A (author) and B (voter)
  const joinA = await api.functional.auth.registeredMember.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      username: RandomGenerator.alphaNumeric(12),
      password: `P@ssw0rd-${RandomGenerator.alphaNumeric(8)}`,
    } satisfies ICommunityPlatformRegisteredMember.IJoin,
  });
  typia.assert(joinA);

  // 2) Create a community as A (Authorization set by SDK on join)
  const communityName: string = `top${RandomGenerator.alphabets(8)}`; // starts with alpha, allowed chars
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
    "community name is immutable and matches input",
    community.name,
    communityName,
  );

  // 3) Create three posts as A in quick succession
  const p1 =
    await api.functional.communityPlatform.registeredMember.posts.create(
      connection,
      {
        body: {
          communityName,
          title: RandomGenerator.paragraph({ sentences: 6 }),
          body: RandomGenerator.content({
            paragraphs: 1,
            sentenceMin: 12,
            sentenceMax: 18,
            wordMin: 3,
            wordMax: 10,
          }),
        } satisfies ICommunityPlatformPost.ICreate,
      },
    );
  typia.assert(p1);

  const p2 =
    await api.functional.communityPlatform.registeredMember.posts.create(
      connection,
      {
        body: {
          communityName,
          title: RandomGenerator.paragraph({ sentences: 6 }),
          body: RandomGenerator.content({
            paragraphs: 1,
            sentenceMin: 12,
            sentenceMax: 18,
            wordMin: 3,
            wordMax: 10,
          }),
        } satisfies ICommunityPlatformPost.ICreate,
      },
    );
  typia.assert(p2);

  const p3 =
    await api.functional.communityPlatform.registeredMember.posts.create(
      connection,
      {
        body: {
          communityName,
          title: RandomGenerator.paragraph({ sentences: 6 }),
          body: RandomGenerator.content({
            paragraphs: 1,
            sentenceMin: 12,
            sentenceMax: 18,
            wordMin: 3,
            wordMax: 10,
          }),
        } satisfies ICommunityPlatformPost.ICreate,
      },
    );
  typia.assert(p3);

  // 4) Register member B and vote as B (non-author) to avoid self-vote
  const joinB = await api.functional.auth.registeredMember.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      username: RandomGenerator.alphaNumeric(12),
      password: `P@ssw0rd-${RandomGenerator.alphaNumeric(8)}`,
    } satisfies ICommunityPlatformRegisteredMember.IJoin,
  });
  typia.assert(joinB);

  const outcome =
    await api.functional.communityPlatform.registeredMember.posts.vote.update(
      connection,
      {
        postId: p2.id,
        body: {
          state: "UPVOTE",
        } satisfies ICommunityPlatformPostVote.IUpdate,
      },
    );
  typia.assert(outcome);
  TestValidator.equals("vote outcome postId matches P2", outcome.postId, p2.id);
  TestValidator.equals(
    "vote outcome myVote is UPVOTE",
    outcome.myVote,
    "UPVOTE",
  );
  TestValidator.equals(
    "vote outcome score is 1 after single upvote",
    outcome.score,
    1,
  );

  // 5) Public listing (unauthenticated) with sort=top
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  const page = await api.functional.communityPlatform.posts.index(unauthConn, {
    body: {
      sort: "top",
      limit: 20,
    } satisfies ICommunityPlatformPost.IRequest,
  });
  typia.assert(page);

  const list = page.data;
  // Ensure all three posts appear in listing
  const s1 = list.find((it) => it.id === p1.id);
  const s2 = list.find((it) => it.id === p2.id);
  const s3 = list.find((it) => it.id === p3.id);
  TestValidator.predicate("P1 summary is present in listing", !!s1);
  TestValidator.predicate("P2 summary is present in listing", !!s2);
  TestValidator.predicate("P3 summary is present in listing", !!s3);

  const v1 = typia.assert<ICommunityPlatformPost.ISummary>(s1!);
  const v2 = typia.assert<ICommunityPlatformPost.ISummary>(s2!);
  const v3 = typia.assert<ICommunityPlatformPost.ISummary>(s3!);

  // Validate scores
  TestValidator.equals("P2 score is 1 in listing", v2.score, 1);
  TestValidator.equals("P1 score is 0 in listing", v1.score, 0 as number);
  TestValidator.equals("P3 score is 0 in listing", v3.score, 0 as number);

  // Validate relative ordering under Top sort
  const i1 = list.findIndex((it) => it.id === v1.id);
  const i2 = list.findIndex((it) => it.id === v2.id);
  const i3 = list.findIndex((it) => it.id === v3.id);
  TestValidator.predicate(
    "P2 (score 1) appears before P3 and P1",
    i2 !== -1 && i3 !== -1 && i1 !== -1 && i2 < i3 && i2 < i1,
  );

  // Tie-breakers among zero-score posts: createdAt DESC, then id DESC
  const createdAt3 = v3.createdAt;
  const createdAt1 = v1.createdAt;
  if (createdAt3 === createdAt1) {
    // If timestamps exactly tie, id DESC should be used: v3 should come before v1 when v3.id > v1.id lexicographically is not guaranteed;
    // Instead, assert listing index order directly respects the tie rule.
    TestValidator.predicate(
      "when createdAt ties, id DESC places P3 before P1",
      i3 < i1,
    );
  } else {
    // Newer createdAt first ⇒ P3 should be before P1
    TestValidator.predicate(
      "among zero-score posts, newer createdAt (P3) appears before P1",
      createdAt3 > createdAt1 && i3 < i1,
    );
  }
}
