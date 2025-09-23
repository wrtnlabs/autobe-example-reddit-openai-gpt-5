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

/**
 * Ensure posts marked as deleted are excluded from Global Latest results.
 *
 * Business context:
 *
 * - Global Latest is a public discovery surface backed by a materialized view of
 *   recent posts. Posts soft-deleted by authors (deleted_at set) must no longer
 *   appear there after the operation.
 *
 * Steps:
 *
 * 1. Join as a community member to obtain an authenticated session.
 * 2. Discover an active category to satisfy community creation dependency.
 * 3. Create a community under the discovered category.
 * 4. Create a post in that community.
 * 5. Soft-delete the post via author endpoint.
 * 6. Fetch Global Latest and validate the deleted post is absent.
 */
export async function test_api_global_latest_posts_excludes_deleted_posts(
  connection: api.IConnection,
) {
  // 1) Join as community member
  const joinBody = {
    username: `u${RandomGenerator.alphaNumeric(8)}`,
    email: `test_${RandomGenerator.alphaNumeric(10)}@example.com`,
    password: `P@ssw0rd${RandomGenerator.alphaNumeric(6)}`,
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const memberAuth: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(connection, {
      body: joinBody,
    });
  typia.assert(memberAuth);

  // 2) Discover an active category
  const categoriesPage =
    await api.functional.communityPlatform.categories.index(connection, {
      body: {
        page: 1,
        limit: 20,
        active: true,
        sortBy: "display_order",
        direction: "asc",
      } satisfies ICommunityPlatformCategory.IRequest,
    });
  typia.assert(categoriesPage);
  TestValidator.predicate(
    "should have at least one active category",
    categoriesPage.data.length > 0,
  );
  const category = categoriesPage.data[0];

  // 3) Create a community
  const communityName = `c${RandomGenerator.alphaNumeric(10)}`; // starts with a letter, length 11
  const communityBody = {
    name: communityName,
    community_platform_category_id: category.id,
    description: RandomGenerator.paragraph({ sentences: 8 }),
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      { body: communityBody },
    );
  typia.assert(community);

  // 4) Create a post in the community
  const postBody = {
    title: RandomGenerator.paragraph({ sentences: 5 }),
    body: RandomGenerator.content({
      paragraphs: 2,
      sentenceMin: 8,
      sentenceMax: 14,
    }),
    author_display_name: RandomGenerator.name(1),
  } satisfies ICommunityPlatformPost.ICreate;
  const post =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      { communityId: community.id, body: postBody },
    );
  typia.assert(post);

  // 5) Soft-delete the post (author-only action)
  await api.functional.communityPlatform.communityMember.posts.erase(
    connection,
    {
      postId: post.id,
    },
  );

  // 6) Fetch Global Latest and confirm the deleted post is absent
  const latest =
    await api.functional.communityPlatform.globalLatestPosts.index(connection);
  typia.assert(latest);

  const found = latest.data.find(
    (e) => e.community_platform_post_id === post.id,
  );
  TestValidator.equals(
    "deleted post must be absent in Global Latest",
    found,
    undefined,
  );
}
