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

export async function test_api_post_search_top_sort_and_pagination(
  connection: api.IConnection,
) {
  // 1) Join as a registered member (auth handled by SDK)
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const username: string = `user_${RandomGenerator.alphaNumeric(8)}`;
  const password: string = `Pw_${RandomGenerator.alphaNumeric(12)}`;

  const authorized = await api.functional.auth.registeredMember.join(
    connection,
    {
      body: {
        email,
        username,
        password,
        displayName: RandomGenerator.name(1),
        client: {
          userAgent: "e2e-tests",
          clientPlatform: "node",
          clientDevice: "ci",
          sessionType: "standard",
        },
      } satisfies ICommunityPlatformRegisteredMember.IJoin,
    },
  );
  typia.assert(authorized);

  // 2) Create two communities to host posts
  const uniqueSuffix = RandomGenerator.alphaNumeric(6).toLowerCase();
  const communityNameA = `test_${uniqueSuffix}_a`;
  const communityNameB = `test_${uniqueSuffix}_b`;

  const communityA =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      {
        body: {
          name: communityNameA,
          category: "Tech & Programming",
          description: RandomGenerator.paragraph({ sentences: 6 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(communityA);

  const communityB =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      {
        body: {
          name: communityNameB,
          category: "Science",
          description: RandomGenerator.paragraph({ sentences: 6 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(communityB);

  // 3) Create many posts embedding a unique keyword in the title
  const keyword = `kw_${RandomGenerator.alphaNumeric(12)}`; // >= 2 chars
  const COUNT = 27; // exceed default 20 to test page limit behavior
  const posts: ICommunityPlatformPost[] = await ArrayUtil.asyncRepeat(
    COUNT,
    async (i) => {
      const c = i % 2 === 0 ? communityA : communityB;
      const created =
        await api.functional.communityPlatform.registeredMember.posts.create(
          connection,
          {
            body: {
              communityName: c.name,
              title:
                `[${keyword}] ` +
                RandomGenerator.paragraph({
                  sentences: 3,
                  wordMin: 3,
                  wordMax: 8,
                }),
              body: RandomGenerator.content({
                paragraphs: 2,
                sentenceMin: 5,
                sentenceMax: 10,
                wordMin: 3,
                wordMax: 8,
              }),
            } satisfies ICommunityPlatformPost.ICreate,
          },
        );
      typia.assert(created);
      return created;
    },
  );

  // 4) Apply votes to shape scores: +1 (UPVOTE), -1 (DOWNVOTE), 0 (no vote)
  await ArrayUtil.asyncForEach(posts, async (post, i) => {
    if (i % 3 === 0) {
      const outcome =
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
    } else if (i % 5 === 0) {
      const outcome =
        await api.functional.communityPlatform.registeredMember.posts.vote.update(
          connection,
          {
            postId: post.id,
            body: {
              state: "DOWNVOTE",
            } satisfies ICommunityPlatformPostVote.IUpdate,
          },
        );
      typia.assert(outcome);
    }
  });

  // Helper to validate Top sorting determinism
  const isTopSorted = (list: ICommunityPlatformPost.ISummary[]): boolean => {
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1];
      const curr = list[i];
      if (prev.score < curr.score) return false; // score DESC
      if (prev.score === curr.score) {
        if (prev.createdAt < curr.createdAt) return false; // createdAt DESC
        if (prev.createdAt === curr.createdAt && prev.id < curr.id)
          return false; // id DESC
      }
    }
    return true;
  };

  // 5) Fetch all matching results (limit=100) and validate global Top order
  const full = await api.functional.communityPlatform.search.posts.index(
    connection,
    {
      body: {
        q: keyword,
        sort: "top",
        limit: 100,
      } satisfies ICommunityPlatformPost.IRequest,
    },
  );
  typia.assert(full);

  TestValidator.predicate(
    "search returns at least one result for the prepared keyword",
    full.data.length > 0,
  );

  TestValidator.predicate(
    "Top sort: ordered by score DESC, then createdAt DESC, then id DESC",
    isTopSorted(full.data),
  );

  // 6) Fetch first page (limit=20) and validate subset stability
  const firstPage = await api.functional.communityPlatform.search.posts.index(
    connection,
    {
      body: {
        q: keyword,
        sort: "top",
        limit: 20,
      } satisfies ICommunityPlatformPost.IRequest,
    },
  );
  typia.assert(firstPage);

  TestValidator.predicate(
    "first page size should be <= 20",
    firstPage.data.length <= 20,
  );

  const expectedFirst = full.data.slice(0, Math.min(20, full.data.length));
  TestValidator.equals(
    "first page equals the first N items of the full (same query/sort) result",
    firstPage.data,
    expectedFirst,
  );
}
