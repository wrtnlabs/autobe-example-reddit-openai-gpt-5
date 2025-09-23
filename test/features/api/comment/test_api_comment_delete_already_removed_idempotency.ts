import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCategory";
import type { ICommunityPlatformComment } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformComment";
import type { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformPost } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformPost";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";
import type { IECategorySortBy } from "@ORGANIZATION/PROJECT-api/lib/structures/IECategorySortBy";
import type { IESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IESortDirection";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformCategory";

/**
 * Delete a comment twice to validate idempotent behavior (already-removed
 * handling).
 *
 * Business flow:
 *
 * 1. Join as a community member to obtain authentication (token handled by SDK).
 * 2. Discover a category to reference when creating a community.
 * 3. Create a community with the discovered category.
 * 4. Create a post within that community.
 * 5. Create a comment under the post (capture commentId).
 * 6. First deletion should succeed (void response).
 * 7. Second deletion should error (already-removed / not-found style outcome),
 *    verifying idempotent behavior with no further side effects.
 */
export async function test_api_comment_delete_already_removed_idempotency(
  connection: api.IConnection,
) {
  // 1) Authenticate (join) as a community member
  const authorized: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(connection, {
      body: typia.random<ICommunityPlatformCommunityMember.ICreate>(),
    });
  typia.assert(authorized);

  // 2) Discover categories (to obtain a valid category id)
  const categoriesPage: IPageICommunityPlatformCategory.ISummary =
    await api.functional.communityPlatform.categories.index(connection, {
      body: {} satisfies ICommunityPlatformCategory.IRequest,
    });
  typia.assert(categoriesPage);
  TestValidator.predicate(
    "at least one category should exist",
    categoriesPage.data.length > 0,
  );
  const chosenCategory: ICommunityPlatformCategory.ISummary =
    categoriesPage.data.find((c) => c.active) ?? categoriesPage.data[0]!;

  // 3) Create a community using the discovered category
  const createCommunityBody = {
    ...typia.random<ICommunityPlatformCommunity.ICreate>(),
    community_platform_category_id: chosenCategory.id,
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community: ICommunityPlatformCommunity =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      { body: createCommunityBody },
    );
  typia.assert(community);

  // 4) Create a post within the community
  const post: ICommunityPlatformPost =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      {
        communityId: community.id,
        body: typia.random<ICommunityPlatformPost.ICreate>(),
      },
    );
  typia.assert(post);
  TestValidator.equals(
    "post should belong to the created community",
    post.community_platform_community_id,
    community.id,
  );

  // 5) Create a comment under the post
  const comment: ICommunityPlatformComment =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      connection,
      {
        postId: post.id,
        body: typia.random<ICommunityPlatformComment.ICreate>(),
      },
    );
  typia.assert(comment);
  TestValidator.equals(
    "comment should reference the target post",
    comment.community_platform_post_id,
    post.id,
  );

  // 6) First deletion: should succeed (void response)
  await api.functional.communityPlatform.communityMember.comments.erase(
    connection,
    { commentId: comment.id },
  );

  // 7) Second deletion: expect error (already removed / not found)
  await TestValidator.error(
    "second deletion of the same comment should fail",
    async () => {
      await api.functional.communityPlatform.communityMember.comments.erase(
        connection,
        { commentId: comment.id },
      );
    },
  );
}
