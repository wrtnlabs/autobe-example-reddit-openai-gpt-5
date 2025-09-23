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
 * Updating a logically removed comment must fail.
 *
 * Steps:
 *
 * 1. Join as a community member (token handled by SDK automatically).
 * 2. Discover a category for community creation (requires at least one category).
 * 3. Create a community in that category.
 * 4. Create a post in the community.
 * 5. Create a comment under the post.
 * 6. Soft-delete the comment (logical removal via deleted_at).
 * 7. Attempt to update the deleted comment and expect an error (business-layer
 *    not-found).
 *
 * Validations:
 *
 * - Typia.assert() on all non-void responses.
 * - Relationship checks: post belongs to community; comment belongs to post.
 * - Error expectation using await TestValidator.error for the update-after-delete
 *   attempt.
 */
export async function test_api_comment_update_not_found_after_logical_removal(
  connection: api.IConnection,
) {
  // Helper to generate a valid community name matching ^[A-Za-z][A-Za-z0-9_-]{1,30}[A-Za-z0-9]$
  const makeCommunityName = (): string => {
    const letters = [..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"];
    const middle = [
      ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-",
    ];
    const tail = [
      ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
    ];
    const length = 10; // 3..32
    let name = RandomGenerator.pick(letters);
    for (let i = 0; i < length - 2; i++) name += RandomGenerator.pick(middle);
    name += RandomGenerator.pick(tail);
    return name;
  };
  // Helper to bound a text within [minLen, maxLen]
  const boundText = (minLen: number, maxLen: number): string => {
    let s = RandomGenerator.paragraph({ sentences: 6, wordMin: 3, wordMax: 8 });
    // Ensure minimum length
    while (s.length < minLen)
      s +=
        " " +
        RandomGenerator.paragraph({ sentences: 3, wordMin: 3, wordMax: 8 });
    if (s.length > maxLen) s = s.slice(0, maxLen);
    return s;
  };

  // 1) Join as community member
  const joinBody = {
    username:
      RandomGenerator.name(1).replace(/\s+/g, "") +
      RandomGenerator.alphaNumeric(4),
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const authorized = await api.functional.auth.communityMember.join(
    connection,
    {
      body: joinBody,
    },
  );
  typia.assert(authorized);

  // 2) Discover category
  const categories = await api.functional.communityPlatform.categories.index(
    connection,
    {
      body: {
        page: 1,
        limit: 20,
        active: true,
        sortBy: "display_order",
        direction: "asc",
      } satisfies ICommunityPlatformCategory.IRequest,
    },
  );
  typia.assert(categories);
  await TestValidator.predicate(
    "at least one category exists to create community",
    async () => categories.data.length > 0,
  );
  const category = categories.data[0];

  // 3) Create community
  const communityBody = {
    name: makeCommunityName(),
    community_platform_category_id: category.id,
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      { body: communityBody },
    );
  typia.assert(community);

  // 4) Create post in the community
  const postTitle = boundText(5, 120);
  const postBody = RandomGenerator.content({
    paragraphs: 2,
    sentenceMin: 8,
    sentenceMax: 15,
    wordMin: 3,
    wordMax: 9,
  });
  const post =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      {
        communityId: community.id,
        body: {
          title: postTitle,
          body: postBody,
          author_display_name: RandomGenerator.name(1),
        } satisfies ICommunityPlatformPost.ICreate,
      },
    );
  typia.assert(post);
  TestValidator.equals(
    "post belongs to the created community",
    post.community_platform_community_id,
    community.id,
  );

  // 5) Create a comment under the post
  const createCommentBody = {
    content: boundText(10, 2000),
  } satisfies ICommunityPlatformComment.ICreate;
  const comment =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      connection,
      {
        postId: post.id,
        body: createCommentBody,
      },
    );
  typia.assert(comment);
  TestValidator.equals(
    "comment belongs to the created post",
    comment.community_platform_post_id,
    post.id,
  );

  // 6) Soft-delete the comment
  await api.functional.communityPlatform.communityMember.comments.erase(
    connection,
    {
      commentId: comment.id,
    },
  );

  // 7) Attempt updating the deleted comment → expect error
  const updateBody = {
    content: boundText(10, 2000),
  } satisfies ICommunityPlatformComment.IUpdate;
  await TestValidator.error(
    "updating a logically deleted comment should fail",
    async () => {
      await api.functional.communityPlatform.communityMember.comments.update(
        connection,
        {
          commentId: comment.id,
          body: updateBody,
        },
      );
    },
  );
}
