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
import type { IECommunityCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityCategory";
import type { IECommunityPlatformCommunityCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformCommunityCategory";
import type { IECommunityPlatformVoteState } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformVoteState";

/**
 * Validate that Global Latest returns exactly 10 newest posts sitewide ordered
 * by (createdAt DESC, id DESC).
 *
 * Workflow
 *
 * 1. Register a member to obtain an authenticated session
 * 2. Create a community (unique name, valid category)
 * 3. Create 12 valid posts under the community in quick succession
 * 4. Call Global Latest and verify:
 *
 *    - Exactly 10 items are returned
 *    - Deterministic ordering by createdAt DESC with id DESC tiebreaker
 *    - The 10 returned IDs equal the top-10 of our 12 created posts sorted by
 *         (createdAt DESC, id DESC)
 *
 * Notes
 *
 * - Soft-delete or removal validation is skipped because no delete API is
 *   provided in materials
 * - SDK handles Authorization automatically after join
 */
export async function test_api_global_latest_exactly_10_newest_ordering(
  connection: api.IConnection,
) {
  // 1) Register a member to authenticate
  const auth = await api.functional.auth.registeredMember.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      username: RandomGenerator.alphaNumeric(12),
      password: `P@ssw0rd_${RandomGenerator.alphaNumeric(6)}`,
      displayName: RandomGenerator.name(2),
      client: {
        userAgent: "e2e-global-latest",
        clientPlatform: "e2e",
        sessionType: "standard",
      } satisfies IClientContext,
    } satisfies ICommunityPlatformRegisteredMember.IJoin,
  });
  typia.assert(auth);

  // 2) Create a community to host test posts
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
  const communityName: string = `e2e-${RandomGenerator.alphaNumeric(10)}`; // matches ^[A-Za-z0-9](?:[A-Za-z0-9_-]{1,28}[A-Za-z0-9])?$

  const community =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      {
        body: {
          name: communityName,
          category: RandomGenerator.pick(categories),
          description: RandomGenerator.paragraph({
            sentences: 10,
            wordMin: 3,
            wordMax: 8,
          }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);

  // 3) Create 12 posts rapidly (valid title/body constraints)
  const createdPosts = await ArrayUtil.asyncRepeat(12, async (index) => {
    const title = RandomGenerator.paragraph({
      sentences: 6,
      wordMin: 3,
      wordMax: 8,
    }); // ~6 words, < 120 chars
    const body = RandomGenerator.content({
      paragraphs: 2,
      sentenceMin: 12,
      sentenceMax: 16,
      wordMin: 3,
      wordMax: 8,
    });

    const post =
      await api.functional.communityPlatform.registeredMember.posts.create(
        connection,
        {
          body: {
            communityName: community.name,
            title,
            body,
            authorDisplayName: RandomGenerator.name(1), // optional 0-32
          } satisfies ICommunityPlatformPost.ICreate,
        },
      );
    typia.assert(post);
    return post;
  });

  // Helper: comparator for (createdAt DESC, id DESC)
  const cmpNewest = (
    a: { createdAt: string; id: string },
    b: { createdAt: string; id: string },
  ): number => {
    const at = Date.parse(a.createdAt);
    const bt = Date.parse(b.createdAt);
    if (at !== bt) return bt - at; // createdAt DESC
    return b.id.localeCompare(a.id); // id DESC
  };

  // Compute expected top-10 IDs from created posts
  const expectedTop10Ids = createdPosts
    .slice()
    .sort(cmpNewest)
    .slice(0, 10)
    .map((p) => p.id);

  // 4) Fetch Global Latest and validate
  const latest =
    await api.functional.communityPlatform.posts.globalLatest.index(connection);
  typia.assert(latest);

  // Exactly 10 items
  TestValidator.equals(
    "global latest returns exactly 10 items",
    latest.data.length,
    10,
  );

  // Verify pairwise ordering by (createdAt DESC, id DESC)
  for (let i = 1; i < latest.data.length; i++) {
    const prev = latest.data[i - 1];
    const curr = latest.data[i];
    const prevMs = Date.parse(prev.createdAt);
    const currMs = Date.parse(curr.createdAt);
    const inOrder =
      prevMs > currMs ||
      (prevMs === currMs && prev.id.localeCompare(curr.id) >= 0);
    TestValidator.predicate(
      `ordering check at index ${i - 1} > ${i} by (createdAt DESC, id DESC)`,
      inOrder,
    );
  }

  // Ensure returned IDs equal expected top-10 derived from our created posts
  const actualIds = latest.data.map((d) => d.id);
  TestValidator.equals(
    "global latest equals top-10 newest created in this test",
    actualIds,
    expectedTop10Ids,
  );
}
