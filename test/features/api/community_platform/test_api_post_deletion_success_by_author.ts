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
 * Verify that the author can logically delete their own post.
 *
 * Steps:
 *
 * 1. Join as community member (Author A).
 * 2. List active categories; if none found, list any categories as fallback.
 * 3. Create a community under a discovered category.
 * 4. Create a post within the community.
 * 5. Confirm the post is retrievable (GET by id) and bound to the community.
 * 6. Delete the post (soft delete via deleted_at).
 * 7. Re-GET must fail (post should be excluded from reads after deletion).
 */
export async function test_api_post_deletion_success_by_author(
  connection: api.IConnection,
) {
  // 1) Join as communityMember (Author A)
  const joinBody = {
    username: `user_${RandomGenerator.alphaNumeric(8)}`,
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(10), // >= 8 chars
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const author: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(connection, {
      body: joinBody,
    });
  typia.assert(author);

  // 2) Discover a category (prefer active=true)
  const catReqActive = {
    page: 1,
    limit: 50,
    active: true,
    sortBy: "display_order" as IECategorySortBy,
    direction: "asc" as IESortDirection,
  } satisfies ICommunityPlatformCategory.IRequest;
  const categoriesActive: IPageICommunityPlatformCategory.ISummary =
    await api.functional.communityPlatform.categories.index(connection, {
      body: catReqActive,
    });
  typia.assert(categoriesActive);

  let category = categoriesActive.data[0];
  if (!category) {
    const catReqAny = {
      page: 1,
      limit: 50,
      sortBy: "display_order" as IECategorySortBy,
      direction: "asc" as IESortDirection,
    } satisfies ICommunityPlatformCategory.IRequest;
    const categoriesAny: IPageICommunityPlatformCategory.ISummary =
      await api.functional.communityPlatform.categories.index(connection, {
        body: catReqAny,
      });
    typia.assert(categoriesAny);
    category = categoriesAny.data[0];
  }
  await TestValidator.predicate(
    "at least one category must exist to proceed",
    category !== undefined,
  );
  typia.assertGuard(category!); // narrow for subsequent usage

  // 3) Create a community
  const communityBody = {
    name: `c${RandomGenerator.alphaNumeric(11)}`,
    community_platform_category_id: category.id,
    description: RandomGenerator.paragraph({ sentences: 8 }),
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community: ICommunityPlatformCommunity =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      { body: communityBody },
    );
  typia.assert(community);

  // 4) Create a post within the community
  const postBody = {
    title: RandomGenerator.paragraph({ sentences: 5 }),
    body: RandomGenerator.content({
      paragraphs: 2,
      sentenceMin: 10,
      sentenceMax: 15,
    }),
    author_display_name: RandomGenerator.name(1),
  } satisfies ICommunityPlatformPost.ICreate;
  const created: ICommunityPlatformPost =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      {
        communityId: community.id,
        body: postBody,
      },
    );
  typia.assert(created);

  // 5) Confirm retrievable and bound correctly
  const beforeDelete: ICommunityPlatformPost =
    await api.functional.communityPlatform.posts.at(connection, {
      postId: created.id,
    });
  typia.assert(beforeDelete);
  TestValidator.equals(
    "pre-deletion GET should return the created post id",
    beforeDelete.id,
    created.id,
  );
  TestValidator.equals(
    "post should belong to the created community",
    beforeDelete.community_platform_community_id,
    community.id,
  );

  // 6) Delete the post (soft-delete)
  await api.functional.communityPlatform.communityMember.posts.erase(
    connection,
    {
      postId: created.id,
    },
  );

  // 7) Re-GET must fail (do not assert specific status code)
  await TestValidator.error(
    "deleted post must not be retrievable",
    async () => {
      await api.functional.communityPlatform.posts.at(connection, {
        postId: created.id,
      });
    },
  );
}
