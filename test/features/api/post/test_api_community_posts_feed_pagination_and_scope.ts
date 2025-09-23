import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformPost } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformPost";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformPost } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformPost";

export async function test_api_community_posts_feed_pagination_and_scope(
  connection: api.IConnection,
) {
  /**
   * Validate community-scoped post listing and deterministic pagination.
   *
   * Steps:
   *
   * 1. Join as a community member (authentication handled by SDK).
   * 2. Create two communities (A, B) using a shared category fixture.
   * 3. Create multiple posts in both communities (A: 25, B: 13).
   * 4. List community A, page 0 (limit=10, sort=newest) and validate:
   *
   *    - Scope: Only posts from A appear.
   *    - Stability: Repeat request returns identical ordering.
   *    - Order matches expected (created_at DESC, id DESC).
   * 5. List community A, page 1 and validate expected slice and no overlap with
   *    page 0.
   * 6. Cross-scope: A feed excludes B posts; B feed items belong to B.
   * 7. Different limit (7): first page matches expected first 7.
   */

  // Helper: community name satisfying ^[A-Za-z][A-Za-z0-9_-]{1,30}[A-Za-z0-9]$
  const makeCommunityName = (): string => {
    const mid = RandomGenerator.alphaNumeric(8); // letters/digits
    return `c${mid}x`;
  };

  // 1) Authenticate a community member
  const regBody = {
    username: `user_${RandomGenerator.alphaNumeric(8)}`,
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const auth = await api.functional.auth.communityMember.join(connection, {
    body: regBody,
  });
  typia.assert<ICommunityPlatformCommunityMember.IAuthorized>(auth);

  // 2) Create two communities (A and B) using a shared category fixture
  const categoryId = typia.random<string & tags.Format<"uuid">>();
  const communityA =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      {
        body: {
          name: makeCommunityName(),
          community_platform_category_id: categoryId,
          description: RandomGenerator.paragraph({ sentences: 8 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert<ICommunityPlatformCommunity>(communityA);

  const communityB =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      {
        body: {
          name: makeCommunityName(),
          community_platform_category_id: categoryId,
          description: RandomGenerator.paragraph({ sentences: 6 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert<ICommunityPlatformCommunity>(communityB);

  // 3) Create multiple posts in both communities
  const createPost = async (
    communityId: string & tags.Format<"uuid">,
    titleWords: number,
  ): Promise<ICommunityPlatformPost> => {
    const post =
      await api.functional.communityPlatform.communityMember.communities.posts.create(
        connection,
        {
          communityId,
          body: {
            title: RandomGenerator.paragraph({
              sentences: Math.max(5, titleWords),
            }),
            body: RandomGenerator.content({ paragraphs: 2 }),
            author_display_name: RandomGenerator.name(1),
          } satisfies ICommunityPlatformPost.ICreate,
        },
      );
    typia.assert<ICommunityPlatformPost>(post);
    return post;
  };

  const countA = 25;
  const countB = 13;
  const postsA: ICommunityPlatformPost[] = [];
  const postsB: ICommunityPlatformPost[] = [];

  // Use sequential creation to stabilize created_at ordering
  for (let i = 0; i < countA; i++)
    postsA.push(await createPost(communityA.id, 6));
  for (let i = 0; i < countB; i++)
    postsB.push(await createPost(communityB.id, 6));

  // Expected newest order (created_at DESC, id DESC tie-breaker)
  const expectedNewestA = [...postsA].sort((x, y) => {
    const t = y.created_at.localeCompare(x.created_at);
    if (t !== 0) return t;
    return y.id.localeCompare(x.id);
  });

  // 4) List page 0 for community A (limit=10)
  const limit10 = 10;
  const page0A = await api.functional.communityPlatform.communities.posts.index(
    connection,
    {
      communityId: communityA.id,
      body: {
        page: 0,
        limit: limit10,
        sort: "newest",
      } satisfies ICommunityPlatformPost.IRequest,
    },
  );
  typia.assert<IPageICommunityPlatformPost.ISummary>(page0A);

  TestValidator.predicate(
    "page 0 only includes posts from community A",
    page0A.data.every(
      (s) => s.community_platform_community_id === communityA.id,
    ),
  );

  const page0ARepeat =
    await api.functional.communityPlatform.communities.posts.index(connection, {
      communityId: communityA.id,
      body: {
        page: 0,
        limit: limit10,
        sort: "newest",
      } satisfies ICommunityPlatformPost.IRequest,
    });
  typia.assert<IPageICommunityPlatformPost.ISummary>(page0ARepeat);
  TestValidator.equals(
    "page 0 ordering is stable (two consecutive calls)",
    page0A.data.map((s) => s.id),
    page0ARepeat.data.map((s) => s.id),
  );

  const expectedIdsPage0 = expectedNewestA.slice(0, limit10).map((p) => p.id);
  TestValidator.equals(
    "page 0 matches expected newest ordering",
    page0A.data.map((s) => s.id),
    expectedIdsPage0,
  );

  // 5) Page 1 validation
  const page1A = await api.functional.communityPlatform.communities.posts.index(
    connection,
    {
      communityId: communityA.id,
      body: {
        page: 1,
        limit: limit10,
        sort: "newest",
      } satisfies ICommunityPlatformPost.IRequest,
    },
  );
  typia.assert<IPageICommunityPlatformPost.ISummary>(page1A);

  const expectedIdsPage1 = expectedNewestA
    .slice(limit10, limit10 * 2)
    .map((p) => p.id);
  TestValidator.equals(
    "page 1 matches expected newest ordering",
    page1A.data.map((s) => s.id),
    expectedIdsPage1,
  );

  const ids0 = new Set(page0A.data.map((s) => s.id));
  const hasOverlap = page1A.data.some((s) => ids0.has(s.id));
  TestValidator.predicate(
    "page 0 and page 1 have no overlapping posts",
    hasOverlap === false,
  );

  // 6) Cross-scope checks
  const bIds = new Set(postsB.map((p) => p.id));
  const aContainsAnyB = [...page0A.data, ...page1A.data].some((s) =>
    bIds.has(s.id),
  );
  TestValidator.predicate(
    "community A feed excludes posts created in community B",
    aContainsAnyB === false,
  );

  const page0B = await api.functional.communityPlatform.communities.posts.index(
    connection,
    {
      communityId: communityB.id,
      body: {
        page: 0,
        limit: limit10,
        sort: "newest",
      } satisfies ICommunityPlatformPost.IRequest,
    },
  );
  typia.assert<IPageICommunityPlatformPost.ISummary>(page0B);
  TestValidator.predicate(
    "page 0 only includes posts from community B",
    page0B.data.every(
      (s) => s.community_platform_community_id === communityB.id,
    ),
  );

  // 7) Different limit (7) still stable
  const limit7 = 7;
  const page0A_lim7 =
    await api.functional.communityPlatform.communities.posts.index(connection, {
      communityId: communityA.id,
      body: {
        page: 0,
        limit: limit7,
        sort: "newest",
      } satisfies ICommunityPlatformPost.IRequest,
    });
  typia.assert<IPageICommunityPlatformPost.ISummary>(page0A_lim7);
  const expectedIdsLim7 = expectedNewestA.slice(0, limit7).map((p) => p.id);
  TestValidator.equals(
    "page 0 (limit=7) matches expected newest ordering",
    page0A_lim7.data.map((s) => s.id),
    expectedIdsLim7,
  );
}
