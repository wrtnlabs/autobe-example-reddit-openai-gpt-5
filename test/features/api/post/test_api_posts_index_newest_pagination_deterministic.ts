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

export async function test_api_posts_index_newest_pagination_deterministic(
  connection: api.IConnection,
) {
  /**
   * Validate global posts listing (newest) and deterministic ordering with
   * public access.
   *
   * Steps:
   *
   * 1. Register a new member account to seed data (authorization handled by SDK).
   * 2. Create a uniquely named community to host posts.
   * 3. Create 26 posts in rapid succession under that community.
   * 4. As an unauthenticated client, request the newest list with limit=20 and
   *    verify:
   *
   *    - Data length is 20
   *    - Ordering strictly follows createdAt DESC; if equal, id DESC
   *    - Deterministic stability: the same request twice yields identical IDs in
   *         order
   *    - Returned posts belong to the freshly seeded set; top item matches latest
   *         seeded post
   *
   * Note: Original scenario requested cursor pagination (nextCursor). Provided
   * DTOs expose page-based metadata without cursor, so this test targets
   * first-page ordering and stability.
   */

  // 1) Register a new member (join)
  const auth = await api.functional.auth.registeredMember.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      username: RandomGenerator.name(1),
      password: RandomGenerator.alphaNumeric(12),
      displayName: RandomGenerator.name(1),
      client: {
        userAgent: `e2e/${RandomGenerator.alphaNumeric(6)}`,
        clientPlatform: "node-e2e",
      },
    } satisfies ICommunityPlatformRegisteredMember.IJoin,
  });
  typia.assert(auth);

  // 2) Create a community to host seed posts
  const communityNameBase = `seoul_tech_${RandomGenerator.alphaNumeric(8)}`; // 3-30, alnum/_/-, start+end alnum
  const community =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      {
        body: {
          name: communityNameBase, // ends with alphanumeric due to alphaNumeric suffix
          category: "Tech & Programming",
          description: RandomGenerator.paragraph({ sentences: 6 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);

  // 3) Create 26 posts under the community in rapid succession
  const POST_COUNT = 26;
  const createdPosts: ICommunityPlatformPost[] = await ArrayUtil.asyncRepeat(
    POST_COUNT,
    async () => {
      const created =
        await api.functional.communityPlatform.registeredMember.posts.create(
          connection,
          {
            body: {
              communityName: community.name,
              title: RandomGenerator.paragraph({ sentences: 6 }), // 5-120 chars
              body: RandomGenerator.content({
                paragraphs: 1,
                sentenceMin: 10,
                sentenceMax: 20,
                wordMin: 3,
                wordMax: 8,
              }), // 10-10,000 chars
              // Optional authorDisplayName: sometimes null, sometimes a short label
              authorDisplayName:
                Math.random() < 0.5 ? null : RandomGenerator.name(1),
            } satisfies ICommunityPlatformPost.ICreate,
          },
        );
      typia.assert(created);
      return created;
    },
  );

  // Build seeded ordering reference: newest (createdAt DESC, id DESC)
  const seededSorted = [...createdPosts].sort((a, b) => {
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    if (ta !== tb) return tb - ta; // DESC by time
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0; // DESC by id (string)
  });

  // 4) Listing as PUBLIC (no Authorization header) with newest, limit=20
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  const page1 = await api.functional.communityPlatform.posts.index(unauthConn, {
    body: {
      sort: "newest",
      limit: 20,
    } satisfies ICommunityPlatformPost.IRequest,
  });
  typia.assert(page1);

  // 4-a) Validate length == 20
  TestValidator.equals("page1 returns 20 items", page1.data.length, 20);

  // 4-b) Validate strict ordering: createdAt DESC, tie-breaker id DESC
  for (let i = 1; i < page1.data.length; ++i) {
    const prev = page1.data[i - 1];
    const next = page1.data[i];
    const tp = new Date(prev.createdAt).getTime();
    const tn = new Date(next.createdAt).getTime();
    const ordered = tp > tn || (tp === tn && prev.id > next.id);
    TestValidator.predicate(
      `newest ordering at index ${i - 1} -> ${i}`,
      ordered,
    );
  }

  // 4-c) Deterministic stability: same request twice should yield identical ID sequence
  const page1Again = await api.functional.communityPlatform.posts.index(
    unauthConn,
    {
      body: {
        sort: "newest",
        limit: 20,
      } satisfies ICommunityPlatformPost.IRequest,
    },
  );
  typia.assert(page1Again);
  const ids1 = page1.data.map((p) => p.id);
  const ids2 = page1Again.data.map((p) => p.id);
  TestValidator.equals(
    "first page IDs are stable across repeated calls",
    ids1,
    ids2,
  );

  // 4-d) Cross-check seeded dominance: top item should be the latest seeded
  const topSeeded = seededSorted[0];
  TestValidator.equals(
    "top item matches latest seeded post",
    page1.data[0]?.id,
    topSeeded?.id,
  );

  // 4-e) Ensure the first page items all belong to the seeded set
  const seededIdSet = new Set(seededSorted.map((p) => p.id));
  const allBelongToSeed = page1.data.every((p) => seededIdSet.has(p.id));
  TestValidator.predicate(
    "page1 items belong to the freshly seeded dataset",
    allBelongToSeed,
  );
}
