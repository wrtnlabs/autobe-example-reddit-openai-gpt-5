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
 * Validate that non-owners cannot update an existing comment and that the
 * comment content remains unchanged after a failed update attempt.
 *
 * Rationale for scenario adjustment: The original plan asked to validate a
 * too-short content (length 1) on update. However, request DTO types enforce
 * minimum length via typia tags at compile-time, and this test suite forbids
 * deliberate type errors. Therefore, we validate a feasible business rule: only
 * the author (User A) can update the comment, and another user (User B) must be
 * rejected. We also re-read the comment afterward to confirm content is
 * unchanged.
 *
 * Steps:
 *
 * 1. Join as User A (communityMember)
 * 2. Fetch categories and pick one (for community creation)
 * 3. Create a community (User A)
 * 4. Create a post in the community (User A)
 * 5. Create a baseline comment on the post (User A), capture id + content
 * 6. Join as User B (switch token)
 * 7. Attempt to update User A's comment (expect error)
 * 8. GET the comment to ensure the content is unchanged
 */
export async function test_api_comment_update_validation_too_short(
  connection: api.IConnection,
) {
  // 1) Authenticate as User A
  const userA = await api.functional.auth.communityMember.join(connection, {
    body: typia.random<ICommunityPlatformCommunityMember.ICreate>(),
  });
  typia.assert(userA);

  // 2) Discover a category for community creation
  const categoriesPage =
    await api.functional.communityPlatform.categories.index(connection, {
      body: {} satisfies ICommunityPlatformCategory.IRequest,
    });
  typia.assert(categoriesPage);
  TestValidator.predicate(
    "at least one category should exist",
    categoriesPage.data.length > 0,
  );
  const category = categoriesPage.data[0];

  // 3) Create a community (User A)
  const createCommunityBody = {
    ...typia.random<ICommunityPlatformCommunity.ICreate>(),
    community_platform_category_id: category.id,
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      { body: createCommunityBody },
    );
  typia.assert(community);

  // 4) Create a post in that community (User A)
  const post =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      {
        communityId: community.id,
        body: typia.random<ICommunityPlatformPost.ICreate>(),
      },
    );
  typia.assert(post);

  // 5) Create a baseline comment on the post (User A)
  const comment =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      connection,
      {
        postId: post.id,
        body: typia.random<ICommunityPlatformComment.ICreate>(),
      },
    );
  typia.assert(comment);
  const originalContent: string = comment.content;

  // 6) Join as User B (switch authentication context)
  const userB = await api.functional.auth.communityMember.join(connection, {
    body: typia.random<ICommunityPlatformCommunityMember.ICreate>(),
  });
  typia.assert(userB);

  // 7) Attempt to update User A's comment as User B (expect error)
  const newContent = typia.random<
    string & tags.MinLength<2> & tags.MaxLength<2000>
  >();
  await TestValidator.error(
    "other user cannot update someone else's comment",
    async () => {
      await api.functional.communityPlatform.communityMember.comments.update(
        connection,
        {
          commentId: comment.id,
          body: {
            content: newContent,
          } satisfies ICommunityPlatformComment.IUpdate,
        },
      );
    },
  );

  // 8) Re-read the comment to ensure content remains unchanged
  const read = await api.functional.communityPlatform.comments.at(connection, {
    commentId: comment.id,
  });
  typia.assert(read);
  TestValidator.equals(
    "comment content remains unchanged after failed update",
    read.content,
    originalContent,
  );
}
