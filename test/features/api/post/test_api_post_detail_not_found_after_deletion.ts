import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCategory";
import type { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformPost } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformPost";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";
import type { IECategorySortBy } from "@ORGANIZATION/PROJECT-api/lib/structures/IECategorySortBy";
import type { IESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IESortDirection";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformCategory";

/**
 * Ensure a deleted post is not retrievable from the public detail endpoint.
 *
 * Workflow:
 *
 * 1. Join as community member (auth handled by SDK).
 * 2. Fetch active categories and select one for community creation.
 * 3. Create a community bound to the selected category.
 * 4. Create a post in that community.
 * 5. Verify the post is publicly retrievable before deletion.
 * 6. Soft-delete the post via member erase endpoint.
 * 7. Verify the deleted post is no longer retrievable (expect an error), without
 *    asserting specific HTTP status codes.
 */
export async function test_api_post_detail_not_found_after_deletion(
  connection: api.IConnection,
) {
  // 1) Join as community member
  const memberAuth = await api.functional.auth.communityMember.join(
    connection,
    {
      body: {
        username: `user_${RandomGenerator.alphaNumeric(8)}`,
        email: typia.random<string & tags.Format<"email">>(),
        password: RandomGenerator.alphaNumeric(12),
      } satisfies ICommunityPlatformCommunityMember.ICreate,
    },
  );
  typia.assert(memberAuth);

  // 2) Discover an active category
  const categoryPage = await api.functional.communityPlatform.categories.index(
    connection,
    {
      body: {
        page: 1,
        limit: 5,
        active: true,
        sortBy: "display_order",
        direction: "asc",
      } satisfies ICommunityPlatformCategory.IRequest,
    },
  );
  typia.assert(categoryPage);
  TestValidator.predicate(
    "at least one active category exists for community creation",
    categoryPage.data.length > 0,
  );
  const category = categoryPage.data[0];

  // 3) Create a community bound to the category
  const community =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      {
        body: {
          name: `c${RandomGenerator.alphaNumeric(10)}`,
          community_platform_category_id: category.id,
          description: RandomGenerator.paragraph({ sentences: 8 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);
  TestValidator.equals(
    "created community should reference chosen category",
    community.community_platform_category_id,
    category.id,
  );

  // 4) Create a post within the community
  const post =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      {
        communityId: community.id,
        body: {
          title: RandomGenerator.paragraph({ sentences: 5 }),
          body: RandomGenerator.content({
            paragraphs: 1,
            sentenceMin: 12,
            sentenceMax: 18,
            wordMin: 3,
            wordMax: 10,
          }),
          author_display_name: RandomGenerator.name(1),
        } satisfies ICommunityPlatformPost.ICreate,
      },
    );
  typia.assert(post);

  // 5) Pre-deletion public read
  const beforeDeletion = await api.functional.communityPlatform.posts.at(
    connection,
    { postId: post.id },
  );
  typia.assert(beforeDeletion);
  TestValidator.equals(
    "pre-deletion read should return the created post id",
    beforeDeletion.id,
    post.id,
  );

  // 6) Delete the post (soft delete)
  await api.functional.communityPlatform.communityMember.posts.erase(
    connection,
    { postId: post.id },
  );

  // 7) Post should not be retrievable anymore
  await TestValidator.error(
    "deleted post should not be retrievable by public detail endpoint",
    async () => {
      await api.functional.communityPlatform.posts.at(connection, {
        postId: post.id,
      });
    },
  );
}
