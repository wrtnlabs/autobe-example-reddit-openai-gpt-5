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
import type { IECommunityPlatformCommentSort } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformCommentSort";
import type { IESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IESortDirection";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformCategory";
import type { IPageICommunityPlatformComment } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformComment";

/**
 * Verify that an authenticated author can delete their own comment and that
 * deleted comments are excluded from subsequent reads and listings.
 *
 * Steps:
 *
 * 1. Join as communityMember (User A) to obtain authentication.
 * 2. Discover a category to use for community creation.
 * 3. Create a community under User A.
 * 4. Create a post in that community.
 * 5. Create a comment on that post and capture its id.
 * 6. Delete the comment via member endpoint.
 * 7. Verify GET by commentId now errors (not readable).
 * 8. Verify PATCH post comments listing excludes the deleted comment.
 */
export async function test_api_comment_delete_success_by_author(
  connection: api.IConnection,
) {
  // 1) Join as a community member (User A)
  const authorized = await api.functional.auth.communityMember.join(
    connection,
    {
      body: typia.random<ICommunityPlatformCommunityMember.ICreate>(),
    },
  );
  typia.assert(authorized);

  // 2) Discover a category
  const categoriesPage =
    await api.functional.communityPlatform.categories.index(connection, {
      body: {
        limit: 20,
        active: true,
      } satisfies ICommunityPlatformCategory.IRequest,
    });
  typia.assert(categoriesPage);
  TestValidator.predicate(
    "categories listing should contain at least one record",
    categoriesPage.data.length > 0,
  );
  const category = categoriesPage.data[0];

  // Helper to build a valid community name: starts with a letter, ends with alnum, allowed chars
  const communityName = (() => {
    const letters = [..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"];
    const alnum = [
      ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
    ];
    const first = RandomGenerator.pick(letters);
    const middle = RandomGenerator.alphaNumeric(6); // middle body
    const last = RandomGenerator.pick(alnum);
    return `${first}${middle}${last}`; // length >= 8, pattern compliant
  })();

  // 3) Create a community
  const community =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      {
        body: {
          name: communityName,
          community_platform_category_id: category.id,
          description: RandomGenerator.paragraph({ sentences: 6 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);

  // 4) Create a post in the community
  const post =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      {
        communityId: community.id,
        body: {
          title: RandomGenerator.paragraph({ sentences: 5 }),
          body: RandomGenerator.content({
            paragraphs: 2,
            sentenceMin: 10,
            sentenceMax: 18,
          }),
        } satisfies ICommunityPlatformPost.ICreate,
      },
    );
  typia.assert(post);

  // 5) Create a comment
  const comment =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      connection,
      {
        postId: post.id,
        body: {
          content: RandomGenerator.paragraph({ sentences: 6 }),
        } satisfies ICommunityPlatformComment.ICreate,
      },
    );
  typia.assert(comment);

  // Validate comment belongs to the post
  TestValidator.equals(
    "comment belongs to the target post",
    comment.community_platform_post_id,
    post.id,
  );

  // 6) Delete the comment
  await api.functional.communityPlatform.communityMember.comments.erase(
    connection,
    { commentId: comment.id },
  );

  // 7) Verify that reading the deleted comment now fails
  await TestValidator.error(
    "deleted comment should not be retrievable",
    async () => {
      await api.functional.communityPlatform.comments.at(connection, {
        commentId: comment.id,
      });
    },
  );

  // 8) Verify that the deleted comment is excluded from listing
  const listAfterDelete =
    await api.functional.communityPlatform.posts.comments.index(connection, {
      postId: post.id,
      body: {
        page: 0,
        limit: 50,
        top_level_only: true,
        sort: "Newest",
      } satisfies ICommunityPlatformComment.IRequest,
    });
  typia.assert(listAfterDelete);

  const existsInList = listAfterDelete.data.some((it) => it.id === comment.id);
  TestValidator.predicate(
    "deleted comment must not appear in the post's comments index",
    existsInList === false,
  );
}
