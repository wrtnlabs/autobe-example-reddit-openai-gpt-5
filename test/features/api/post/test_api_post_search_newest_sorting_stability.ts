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
 * Verify Newest sorting stability and deterministic tie-breakers in post
 * search.
 *
 * Purpose:
 *
 * - Ensure PATCH /communityPlatform/search/posts defaults to Newest sorting
 *   (createdAt DESC, id DESC) and that explicit sort="newest" produces the same
 *   order.
 *
 * Steps:
 *
 * 1. Register a member (auth) to create data.
 * 2. Create a community with a valid unique name and allowed category.
 * 3. Create 25 posts under that community, each embedding a shared random keyword
 *    in title/body to isolate search results; create them in quick succession
 *    to encourage close (possibly identical) createdAt values.
 * 4. Search posts with the keyword using default sort (omit sort) and validate:
 *
 *    - CreatedAt is non-increasing (DESC)
 *    - If createdAt equals for adjacent items, id is strictly DESC
 *    - First page IDs match manual sort of created posts by (createdAt DESC, id
 *         DESC) truncated to 20
 * 5. Search again with sort="newest"; validate identical ID order with step 4.
 */
export async function test_api_post_search_newest_sorting_stability(
  connection: api.IConnection,
) {
  // 1) Register a member (authentication for setup)
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    username: `user_${RandomGenerator.alphaNumeric(8)}`,
    password: `P@ssw0rd_${RandomGenerator.alphaNumeric(8)}`,
    displayName: RandomGenerator.name(2),
    client: {
      userAgent: "e2e-tests",
      clientPlatform: "node",
      clientDevice: "ci",
      sessionType: "standard",
    },
  } satisfies ICommunityPlatformRegisteredMember.IJoin;
  const authorized = await api.functional.auth.registeredMember.join(
    connection,
    { body: joinBody },
  );
  typia.assert(authorized);

  // 2) Create a community with a valid name and category
  const communityName: string = `e2e${RandomGenerator.alphaNumeric(10)}`; // alphanumeric, 3–30
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
  const communityBody = {
    name: communityName,
    category: RandomGenerator.pick(categories),
    description: RandomGenerator.paragraph({
      sentences: 10,
      wordMin: 3,
      wordMax: 8,
    }),
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      { body: communityBody },
    );
  typia.assert(community);
  TestValidator.equals(
    "created community name should match request",
    community.name,
    communityName,
  );

  // 3) Create many posts embedding a unique keyword
  const keyword: string = `kw${RandomGenerator.alphaNumeric(6)}`;
  const TOTAL = 25;
  const createdPosts: ICommunityPlatformPost[] = await ArrayUtil.asyncRepeat(
    TOTAL,
    async (i) => {
      const titleBase = `${keyword} ${RandomGenerator.paragraph({ sentences: 3, wordMin: 4, wordMax: 8 })}`;
      const title =
        titleBase.length > 118 ? titleBase.slice(0, 118) : titleBase; // keep comfortably ≤120
      const bodyText = `${keyword} ${RandomGenerator.content({ paragraphs: 1, sentenceMin: 8, sentenceMax: 14, wordMin: 3, wordMax: 8 })}`;
      const post =
        await api.functional.communityPlatform.registeredMember.posts.create(
          connection,
          {
            body: {
              communityName,
              title,
              body: bodyText,
              authorDisplayName: RandomGenerator.name(1),
            } satisfies ICommunityPlatformPost.ICreate,
          },
        );
      typia.assert(post);
      return post;
    },
  );

  // Prepare expected order: createdAt DESC, then id DESC
  const expectedSorted = [...createdPosts].sort((a, b) => {
    const ta = Date.parse(a.createdAt);
    const tb = Date.parse(b.createdAt);
    if (ta !== tb) return tb - ta; // newer first
    // UUID DESC (lexicographic)
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
  const expectedTop20Ids = expectedSorted.slice(0, 20).map((p) => p.id);

  // 4) Search with default sort (newest by default)
  const page1 = await api.functional.communityPlatform.search.posts.index(
    connection,
    {
      body: {
        q: keyword,
        limit: 20,
      } satisfies ICommunityPlatformPost.IRequest,
    },
  );
  typia.assert(page1);

  // Validate page size equals min(TOTAL, 20)
  TestValidator.equals(
    "search first page size should be top-20 of created posts",
    page1.data.length,
    expectedTop20Ids.length,
  );

  // Validate ordering equals manual expectation
  const actualIds = page1.data.map((x) => x.id);
  TestValidator.equals(
    "default newest results must match expected first-page IDs",
    actualIds,
    expectedTop20Ids,
  );

  // Validate monotonic non-increasing createdAt and id DESC tie-breakers
  for (let i = 1; i < page1.data.length; i++) {
    const prev = page1.data[i - 1];
    const curr = page1.data[i];
    const prevTs = Date.parse(prev.createdAt);
    const currTs = Date.parse(curr.createdAt);
    TestValidator.predicate(
      `createdAt must be non-increasing at index ${i}`,
      prevTs >= currTs,
    );
    if (prevTs === currTs) {
      TestValidator.predicate(
        `id must be DESC when createdAt equal at index ${i}`,
        prev.id > curr.id,
      );
    }
  }

  // Validate results belong to the same community and include keyword in title
  for (const item of page1.data) {
    TestValidator.equals(
      "each result should belong to created community",
      item.community.name,
      communityName,
    );
    TestValidator.predicate(
      "result title should include the keyword",
      item.title.toLowerCase().includes(keyword.toLowerCase()),
    );
  }

  // 5) Search again with explicit sort = "newest" and compare orders
  const page1Newest = await api.functional.communityPlatform.search.posts.index(
    connection,
    {
      body: {
        q: keyword,
        sort: "newest",
        limit: 20,
      } satisfies ICommunityPlatformPost.IRequest,
    },
  );
  typia.assert(page1Newest);
  TestValidator.equals(
    "default sort equivalence with explicit sort=newest",
    page1Newest.data.map((x) => x.id),
    actualIds,
  );
}
