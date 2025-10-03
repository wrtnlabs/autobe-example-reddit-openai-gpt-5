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
 * Verify Newest ordering and limit-based pagination for community posts
 * listing.
 *
 * Business context:
 *
 * - Reads are public; writes (join, create community, create posts) require
 *   authentication.
 * - Newest ordering is defined as createdAt DESC with id DESC as a tie-breaker.
 *
 * Steps:
 *
 * 1. Register a member for authenticated setup operations.
 * 2. Create a community to scope posts.
 * 3. Create 25 posts in quick succession under that community.
 * 4. Call community posts index with sort=newest and limit=20 using a public
 *    connection.
 *
 *    - Validate item count (20) and strict ordering rules.
 *    - Compare against locally sorted expectation built from created posts.
 * 5. Call again with a large limit (e.g., 100) to retrieve all 25 posts and
 *    validate complete ordering and community consistency.
 */
export async function test_api_community_posts_newest_sort_and_pagination(
  connection: api.IConnection,
) {
  // 1) Register a member (authentication for setup)
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const username: string = RandomGenerator.alphabets(10);
  const authorized: ICommunityPlatformRegisteredMember.IAuthorized =
    await api.functional.auth.registeredMember.join(connection, {
      body: {
        email,
        username,
        password: "P@ssw0rd!123",
        displayName: RandomGenerator.name(1),
        client: {
          userAgent: "e2e-community-tests",
          sessionType: "standard",
        },
      } satisfies ICommunityPlatformRegisteredMember.IJoin,
    });
  typia.assert(authorized);

  // 2) Create a community
  const communityName: string = `e2e_${RandomGenerator.alphaNumeric(10)}`; // starts with alpha, ends alnum
  const community: ICommunityPlatformCommunity =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      {
        body: {
          name: communityName,
          category: typia.random<IECommunityCategory>(),
          description: RandomGenerator.paragraph({
            sentences: 8,
            wordMin: 4,
            wordMax: 10,
          }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);

  // 3) Create 25 posts in quick succession
  const createdPosts: ICommunityPlatformPost[] = await ArrayUtil.asyncRepeat(
    25,
    async (i) => {
      const title = `${RandomGenerator.paragraph({
        sentences: 5,
        wordMin: 4,
        wordMax: 10,
      })} #${String(i + 1).padStart(2, "0")}`;
      const body = RandomGenerator.content({
        paragraphs: 1,
        sentenceMin: 10,
        sentenceMax: 20,
        wordMin: 4,
        wordMax: 10,
      });
      const post =
        await api.functional.communityPlatform.registeredMember.posts.create(
          connection,
          {
            body: {
              communityName,
              title,
              body,
            } satisfies ICommunityPlatformPost.ICreate,
          },
        );
      typia.assert(post);
      return post;
    },
  );
  TestValidator.equals(
    "created 25 posts for community",
    createdPosts.length,
    25,
  );

  // Expected order: createdAt DESC, then id DESC
  const expectedNewest = [...createdPosts].sort((a, b) => {
    const t = Date.parse(b.createdAt) - Date.parse(a.createdAt);
    if (t !== 0) return t;
    return b.id.localeCompare(a.id);
  });

  // Public connection for read (do not touch headers after creation)
  const publicConn: api.IConnection = { ...connection, headers: {} };

  // 4) First page: limit=20, sort=newest
  const page1 = await api.functional.communityPlatform.communities.posts.index(
    publicConn,
    {
      communityName,
      body: {
        sort: "newest",
        limit: 20 as number,
      } satisfies ICommunityPlatformPost.IRequest,
    },
  );
  typia.assert(page1);

  TestValidator.equals("page1 returns exactly 20 items", page1.data.length, 20);

  // Validate per-step non-increasing createdAt and id DESC tie-breaker
  for (let i = 1; i < page1.data.length; i++) {
    const prev = page1.data[i - 1];
    const curr = page1.data[i];
    const ordered =
      Date.parse(prev.createdAt) > Date.parse(curr.createdAt) ||
      (prev.createdAt === curr.createdAt && prev.id > curr.id);
    TestValidator.predicate(`newest ordering on page1 at index ${i}`, ordered);
  }

  // Compare with expected IDs (top 20)
  const page1Ids = page1.data.map((s) => s.id);
  const expectedIdsPage1 = expectedNewest.slice(0, 20).map((p) => p.id);
  TestValidator.equals(
    "page1 IDs match expected newest order",
    page1Ids,
    expectedIdsPage1,
  );

  // 5) Retrieve all with a large limit and validate full ordering and community consistency
  const allPage =
    await api.functional.communityPlatform.communities.posts.index(publicConn, {
      communityName,
      body: {
        sort: "newest",
        limit: 100 as number,
      } satisfies ICommunityPlatformPost.IRequest,
    });
  typia.assert(allPage);

  TestValidator.equals(
    "allPage returns all 25 items",
    allPage.data.length,
    createdPosts.length,
  );

  // Validate community name consistency on all results
  const allSameCommunity = allPage.data.every(
    (s) => s.community.name === communityName,
  );
  TestValidator.predicate(
    "all returned posts belong to the target community",
    allSameCommunity,
  );

  // Validate full ordering equals expected
  const allIds = allPage.data.map((s) => s.id);
  const expectedAllIds = expectedNewest.map((p) => p.id);
  TestValidator.equals(
    "all items match expected newest order",
    allIds,
    expectedAllIds,
  );
}
