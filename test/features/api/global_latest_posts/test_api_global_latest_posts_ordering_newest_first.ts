import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCategory";
import type { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformGlobalLatestPost } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformGlobalLatestPost";
import type { ICommunityPlatformPost } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformPost";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";
import type { IECategorySortBy } from "@ORGANIZATION/PROJECT-api/lib/structures/IECategorySortBy";
import type { IESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IESortDirection";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformCategory";
import type { IPageICommunityPlatformGlobalLatestPost } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformGlobalLatestPost";

export async function test_api_global_latest_posts_ordering_newest_first(
  connection: api.IConnection,
) {
  // 1) Join as a community member (authenticate)
  const joinBody = {
    username: `user_${RandomGenerator.alphaNumeric(8)}`,
    email: typia.random<string & tags.Format<"email">>(),
    password: `P${RandomGenerator.alphaNumeric(11)}`, // >= 8 chars
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const auth = await api.functional.auth.communityMember.join(connection, {
    body: joinBody,
  });
  typia.assert(auth);

  // 2) Discover an active category (fallback to any if none)
  const pageActive = await api.functional.communityPlatform.categories.index(
    connection,
    {
      body: {
        page: 1,
        limit: 50,
        active: true,
        sortBy: "created_at",
        direction: "desc",
      } satisfies ICommunityPlatformCategory.IRequest,
    },
  );
  typia.assert(pageActive);

  let category = pageActive.data[0];
  if (!category) {
    const pageAny = await api.functional.communityPlatform.categories.index(
      connection,
      {
        body: {
          page: 1,
          limit: 50,
          sortBy: "created_at",
          direction: "desc",
        } satisfies ICommunityPlatformCategory.IRequest,
      },
    );
    typia.assert(pageAny);
    category = pageAny.data[0];
  }
  if (!category) throw new Error("No available category to create a community");

  // 3) Create a community under the chosen category
  const communityName = `c${RandomGenerator.alphaNumeric(10)}`; // starts with letter, ends alnum, length >=3
  const community =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      {
        body: {
          name: communityName,
          community_platform_category_id: category.id,
          description: RandomGenerator.paragraph({ sentences: 8 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);

  // 4) Create two posts (P1 then P2) in the community
  const p1 =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      {
        communityId: community.id,
        body: {
          title: RandomGenerator.paragraph({ sentences: 5 }),
          body: RandomGenerator.content({
            paragraphs: 1,
            sentenceMin: 12,
            sentenceMax: 20,
            wordMin: 3,
            wordMax: 8,
          }),
          author_display_name: RandomGenerator.name(1),
        } satisfies ICommunityPlatformPost.ICreate,
      },
    );
  typia.assert(p1);

  const p2 =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      {
        communityId: community.id,
        body: {
          title: RandomGenerator.paragraph({ sentences: 6 }),
          body: RandomGenerator.content({
            paragraphs: 1,
            sentenceMin: 12,
            sentenceMax: 20,
            wordMin: 3,
            wordMax: 8,
          }),
          author_display_name: RandomGenerator.name(1),
        } satisfies ICommunityPlatformPost.ICreate,
      },
    );
  typia.assert(p2);

  // 5) Fetch Global Latest posts and validate
  const latest =
    await api.functional.communityPlatform.globalLatestPosts.index(connection);
  typia.assert(latest);

  // Validate size constraint (up to 10 items)
  TestValidator.predicate(
    "global latest returns at most 10 items",
    latest.data.length <= 10,
  );

  // Validate list is ordered by created_at descending overall
  const isDescSorted = latest.data.every((_, i, arr) =>
    i === 0
      ? true
      : new Date(arr[i - 1].created_at).getTime() >=
        new Date(arr[i].created_at).getTime(),
  );
  TestValidator.predicate(
    "global latest list is ordered by created_at descending",
    isDescSorted,
  );

  // Locate P1 and P2; if both exist, validate ordering and denormalized fields
  const idxP1 = latest.data.findIndex(
    (g) => g.community_platform_post_id === p1.id,
  );
  const idxP2 = latest.data.findIndex(
    (g) => g.community_platform_post_id === p2.id,
  );

  if (idxP1 !== -1 && idxP2 !== -1) {
    const gP1 = latest.data[idxP1]!;
    const gP2 = latest.data[idxP2]!;

    // Titles should match denormalized fields
    TestValidator.equals(
      "P1 denormalized title matches original",
      gP1.title,
      p1.title,
    );
    TestValidator.equals(
      "P2 denormalized title matches original",
      gP2.title,
      p2.title,
    );

    // Community linkage should match
    TestValidator.equals(
      "P1 community id matches",
      gP1.community_platform_community_id,
      community.id,
    );
    TestValidator.equals(
      "P2 community id matches",
      gP2.community_platform_community_id,
      community.id,
    );

    // Ordering: P2 should not appear after P1 when it is newer (or equal)
    const p1At = new Date(p1.created_at).getTime();
    const p2At = new Date(p2.created_at).getTime();
    const orderOk = p2At > p1At ? idxP2 < idxP1 : idxP2 <= idxP1;
    TestValidator.predicate(
      "P2 appears no later than P1 in newest-first ordering",
      orderOk,
    );
  }
}
