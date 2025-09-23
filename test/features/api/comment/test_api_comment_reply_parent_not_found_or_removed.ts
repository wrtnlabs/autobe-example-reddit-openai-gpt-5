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
 * Reply creation must fail when parent comment is removed.
 *
 * Business goal:
 *
 * - Ensure that attempting to reply to a soft-deleted parent comment is rejected.
 *
 * Steps:
 *
 * 1. Join as a community member to authenticate.
 * 2. List categories and pick one (must exist) for community creation.
 * 3. Create a community under the selected category.
 * 4. Create a post in that community.
 * 5. Create a top-level parent comment on the post.
 * 6. Soft-delete that parent comment.
 * 7. Attempt to create a reply under the deleted parent comment and expect an
 *    error.
 */
export async function test_api_comment_reply_parent_not_found_or_removed(
  connection: api.IConnection,
) {
  // 1) Authenticate (join) as communityMember
  const auth = await api.functional.auth.communityMember.join(connection, {
    body: {
      username: RandomGenerator.name(1),
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(10),
    } satisfies ICommunityPlatformCommunityMember.ICreate,
  });
  typia.assert(auth);

  // 2) Discover categories for community creation
  const categoriesPage =
    await api.functional.communityPlatform.categories.index(connection, {
      body: {
        page: 1,
        limit: 10,
        active: true,
        sortBy: "display_order",
        direction: "asc",
      } satisfies ICommunityPlatformCategory.IRequest,
    });
  typia.assert(categoriesPage);
  TestValidator.predicate(
    "category search should return at least one active category",
    categoriesPage.data.length > 0,
  );
  const category = categoriesPage.data[0];

  // 3) Create community under selected category
  const community =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      {
        body: {
          name: RandomGenerator.alphabets(8),
          community_platform_category_id: category.id,
          description: RandomGenerator.paragraph({ sentences: 6 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);

  // 4) Create post in the community
  const post =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      {
        communityId: community.id,
        body: {
          title: RandomGenerator.paragraph({ sentences: 4 }),
          body: RandomGenerator.content({ paragraphs: 2, sentenceMin: 8 }),
        } satisfies ICommunityPlatformPost.ICreate,
      },
    );
  typia.assert(post);

  // 5) Create a top-level parent comment
  const parent =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      connection,
      {
        postId: post.id,
        body: {
          content: RandomGenerator.paragraph({ sentences: 10 }),
        } satisfies ICommunityPlatformComment.ICreate,
      },
    );
  typia.assert(parent);

  // 6) Soft-delete the parent comment
  await api.functional.communityPlatform.communityMember.comments.erase(
    connection,
    { commentId: parent.id },
  );

  // 7) Attempt to reply to the deleted parent comment and expect failure
  await TestValidator.error(
    "creating a reply to a deleted parent comment must fail",
    async () => {
      await api.functional.communityPlatform.communityMember.comments.replies.create(
        connection,
        {
          commentId: parent.id,
          body: {
            content: RandomGenerator.paragraph({ sentences: 6 }),
            parent_id: parent.id,
          } satisfies ICommunityPlatformComment.ICreate,
        },
      );
    },
  );
}
