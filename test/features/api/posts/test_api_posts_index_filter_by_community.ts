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
import type { ICommunityPlatformRegisteredMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRegisteredMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";
import type { ICommunityRef } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityRef";
import type { IECommunityCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityCategory";
import type { IECommunityPlatformCommunityCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformCommunityCategory";
import type { IECommunityPlatformVoteState } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformVoteState";
import type { IEPostSort } from "@ORGANIZATION/PROJECT-api/lib/structures/IEPostSort";
import type { IEVoteState } from "@ORGANIZATION/PROJECT-api/lib/structures/IEVoteState";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformPost } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformPost";
import type { IUserRef } from "@ORGANIZATION/PROJECT-api/lib/structures/IUserRef";

/**
 * Validate listing with search-token subset and deterministic newest ordering.
 *
 * Scenario rewrite notice:
 *
 * - The request DTO (ICommunityPlatformPost.IRequest) does not expose a dedicated
 *   community filter field, and the response page type does not carry a
 *   continuation cursor. Therefore, this test emulates a “filter by community”
 *   by embedding a unique token in all titles of posts created in a given
 *   community and querying with q=token to isolate that subset. This complies
 *   with IRequest while validating stable ordering and subset correctness.
 *
 * Steps:
 *
 * 1. Register a member (join) to obtain authenticated session.
 * 2. Create two communities C1 and C2 with valid names and categories.
 * 3. Create interleaved posts in C1 and C2; each community uses its own unique
 *    token in the title to enable text-based filtering.
 * 4. Call PATCH /communityPlatform/posts with { sort: "newest", q: token1, limit:
 *    20 } and assert:
 *
 *    - Every item has the token in title, meaning it belongs to the intended subset
 *         (C1-only posts used token1)
 *    - Ordering: createdAt DESC with id DESC tiebreaker
 *    - Result size <= limit
 * 5. Repeat for C2 (token2) to confirm symmetric behavior.
 */
export async function test_api_posts_index_filter_by_community(
  connection: api.IConnection,
) {
  // 1) Register a member to enable subsequent community/post creations
  const authorized = await api.functional.auth.registeredMember.join(
    connection,
    {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        username: `user_${RandomGenerator.alphaNumeric(10)}`,
        password: RandomGenerator.alphaNumeric(16),
        displayName: RandomGenerator.name(2),
        client: {
          userAgent: "e2e/agent",
          clientDevice: "e2e",
          clientPlatform: "node",
          sessionType: "standard",
        } satisfies IClientContext,
      } satisfies ICommunityPlatformRegisteredMember.IJoin,
    },
  );
  typia.assert(authorized);

  // 2) Create two communities
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

  const c1Name = `c_${RandomGenerator.alphaNumeric(10)}`;
  const c2Name = `c_${RandomGenerator.alphaNumeric(10)}`;

  const community1 =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      {
        body: {
          name: c1Name,
          category: RandomGenerator.pick(categories),
          description: RandomGenerator.paragraph({ sentences: 8 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community1);
  TestValidator.equals(
    "community1 name should match requested name",
    community1.name,
    c1Name,
  );

  const community2 =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      {
        body: {
          name: c2Name,
          category: RandomGenerator.pick(categories),
          description: RandomGenerator.paragraph({ sentences: 8 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community2);
  TestValidator.equals(
    "community2 name should match requested name",
    community2.name,
    c2Name,
  );

  // 3) Create interleaved posts for each community
  //    Use unique tokens per community in titles so that q=token isolates subset
  const token1 = `c1_${RandomGenerator.alphaNumeric(6)}`; // q must be >= 2 chars
  const token2 = `c2_${RandomGenerator.alphaNumeric(6)}`;

  const countC1 = 12;
  const countC2 = 13;
  const rounds = Math.max(countC1, countC2);

  for (let i = 0; i < rounds; i++) {
    if (i < countC1) {
      const created1 =
        await api.functional.communityPlatform.registeredMember.posts.create(
          connection,
          {
            body: {
              communityName: c1Name,
              title: `[${token1}] ${RandomGenerator.paragraph({ sentences: 5 })}`,
              body: RandomGenerator.content({ paragraphs: 2 }),
              authorDisplayName: RandomGenerator.name(1),
            } satisfies ICommunityPlatformPost.ICreate,
          },
        );
      typia.assert(created1);
      TestValidator.equals(
        "created post 1 belongs to community1",
        created1.community.name,
        c1Name,
      );
    }
    if (i < countC2) {
      const created2 =
        await api.functional.communityPlatform.registeredMember.posts.create(
          connection,
          {
            body: {
              communityName: c2Name,
              title: `[${token2}] ${RandomGenerator.paragraph({ sentences: 5 })}`,
              body: RandomGenerator.content({ paragraphs: 2 }),
              authorDisplayName: RandomGenerator.name(1),
            } satisfies ICommunityPlatformPost.ICreate,
          },
        );
      typia.assert(created2);
      TestValidator.equals(
        "created post 2 belongs to community2",
        created2.community.name,
        c2Name,
      );
    }
  }

  // Helper to validate newest ordering with id DESC tiebreaker
  const assert_newest_order = (
    title: string,
    data: ICommunityPlatformPost.ISummary[],
  ) => {
    const ok = data.every((curr, idx, arr) => {
      if (idx === 0) return true;
      const prev = arr[idx - 1];
      // ISO 8601 strings compare lexicographically for time order
      if (prev.createdAt > curr.createdAt) return true; // strictly newer first
      if (prev.createdAt < curr.createdAt) return false; // violates DESC
      // same createdAt → id DESC
      return prev.id >= curr.id;
    });
    TestValidator.predicate(title, ok);
  };

  // 4) Query by token1 (C1 subset) and validate subset correctness & ordering
  const pageC1 = await api.functional.communityPlatform.posts.index(
    connection,
    {
      body: {
        sort: "newest",
        q: token1,
        limit: 20 as number,
      } satisfies ICommunityPlatformPost.IRequest,
    },
  );
  typia.assert(pageC1);

  TestValidator.predicate(
    "pageC1 results are all token1 posts (subset correctness)",
    pageC1.data.every((p) => p.title.includes(token1)),
  );
  assert_newest_order(
    "pageC1 respects newest ordering with id DESC tiebreaker",
    pageC1.data,
  );
  TestValidator.predicate(
    "pageC1 size must be <= requested limit",
    pageC1.data.length <= pageC1.pagination.limit,
  );

  // 5) Query by token2 (C2 subset) and validate subset correctness & ordering
  const pageC2 = await api.functional.communityPlatform.posts.index(
    connection,
    {
      body: {
        sort: "newest",
        q: token2,
        limit: 20 as number,
      } satisfies ICommunityPlatformPost.IRequest,
    },
  );
  typia.assert(pageC2);

  TestValidator.predicate(
    "pageC2 results are all token2 posts (subset correctness)",
    pageC2.data.every((p) => p.title.includes(token2)),
  );
  assert_newest_order(
    "pageC2 respects newest ordering with id DESC tiebreaker",
    pageC2.data,
  );
  TestValidator.predicate(
    "pageC2 size must be <= requested limit",
    pageC2.data.length <= pageC2.pagination.limit,
  );
}
