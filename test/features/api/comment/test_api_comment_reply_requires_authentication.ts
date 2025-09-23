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
 * Ensure replies cannot be created without authentication.
 *
 * Business flow:
 *
 * 1. Register a community member (authentication established automatically by
 *    SDK).
 * 2. Discover an active category (for community classification).
 * 3. Create a community under that category.
 * 4. Create a post in the community.
 * 5. Create a top-level parent comment for the post.
 * 6. Simulate a guest (unauthenticated) connection and attempt to create a reply
 *    to the parent comment.
 *
 * Expectations:
 *
 * - All setup steps succeed under an authenticated session.
 * - The unauthenticated reply creation is rejected (business rule enforcement),
 *   validated using TestValidator.error without checking specific HTTP status
 *   codes.
 */
export async function test_api_comment_reply_requires_authentication(
  connection: api.IConnection,
) {
  // 1) Register a community member (join)
  const joinBody = {
    username: `user_${RandomGenerator.alphaNumeric(8)}`,
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12), // >= 8 chars
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const authorized: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(connection, {
      body: joinBody,
    });
  typia.assert(authorized);

  // 2) Discover an active category
  const categoryPage = await api.functional.communityPlatform.categories.index(
    connection,
    {
      body: {
        active: true,
        limit: 1,
        sortBy: "display_order",
        direction: "asc",
      } satisfies ICommunityPlatformCategory.IRequest,
    },
  );
  typia.assert(categoryPage);
  TestValidator.predicate(
    "at least one active category must exist",
    categoryPage.data.length > 0,
  );
  const category = categoryPage.data[0];

  // 3) Create a community under the discovered category
  const communityName = `c${RandomGenerator.alphaNumeric(6)}_${RandomGenerator.alphaNumeric(4)}`; // starts with letter, includes [a-z0-9_], ends alnum
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
          title: RandomGenerator.paragraph({ sentences: 6 }),
          body: RandomGenerator.content({
            paragraphs: 2,
            sentenceMax: 18,
            sentenceMin: 10,
          }),
        } satisfies ICommunityPlatformPost.ICreate,
      },
    );
  typia.assert(post);

  // 5) Create a top-level parent comment for the post
  const parentComment =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      connection,
      {
        postId: post.id,
        body: {
          content: RandomGenerator.paragraph({ sentences: 8 }),
        } satisfies ICommunityPlatformComment.ICreate,
      },
    );
  typia.assert(parentComment);

  // 6) Simulate a guest (unauthenticated) connection and attempt to reply
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "unauthenticated user cannot create a reply to a comment",
    async () => {
      await api.functional.communityPlatform.communityMember.comments.replies.create(
        unauthConn,
        {
          commentId: parentComment.id,
          body: {
            content: RandomGenerator.paragraph({ sentences: 5 }),
            parent_id: parentComment.id,
          } satisfies ICommunityPlatformComment.ICreate,
        },
      );
    },
  );
}
