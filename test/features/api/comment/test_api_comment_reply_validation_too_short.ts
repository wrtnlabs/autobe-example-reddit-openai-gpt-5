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
 * Enforce minimum content length when creating a reply comment (1 char should
 * fail).
 *
 * Business flow:
 *
 * 1. Authenticate a community member (join)
 * 2. Discover categories and pick one
 * 3. Create a community under the chosen category
 * 4. Create a post in that community
 * 5. Create a valid parent comment on the post
 * 6. Attempt to create a reply with content length = 1 and expect an error
 */
export async function test_api_comment_reply_validation_too_short(
  connection: api.IConnection,
) {
  // 1) Authenticate a community member
  const authInput = {
    username: `user_${RandomGenerator.alphaNumeric(8)}`,
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12), // >= 8 chars
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const member: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(connection, {
      body: authInput,
    });
  typia.assert(member);

  // 2) Discover an active category to create a community
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
  TestValidator.predicate(
    "at least one category exists",
    categories.data.length > 0,
  );
  const category = categories.data[0];

  // 3) Create a community under the selected category
  const communityName = `c${RandomGenerator.alphaNumeric(8)}`; // starts with a letter, 3-32 length
  const community =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      {
        body: {
          name: communityName,
          community_platform_category_id: category.id,
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
          title: RandomGenerator.paragraph({ sentences: 3 }), // 5–120 chars
          body: RandomGenerator.content({
            paragraphs: 1,
            sentenceMin: 5,
            sentenceMax: 10,
            wordMin: 3,
            wordMax: 8,
          }), // 10–10,000 chars
          author_display_name: RandomGenerator.name(1),
        } satisfies ICommunityPlatformPost.ICreate,
      },
    );
  typia.assert(post);

  // 5) Create a valid parent comment (top-level)
  const parentComment =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      connection,
      {
        postId: post.id,
        body: {
          content: "parent comment", // >= 2 chars
          parent_id: null,
        } satisfies ICommunityPlatformComment.ICreate,
      },
    );
  typia.assert(parentComment);

  // 6) Attempt to create a reply with too-short content (1 char)
  await TestValidator.error(
    "reply creation should fail when content is too short (1 char)",
    async () => {
      await api.functional.communityPlatform.communityMember.comments.replies.create(
        connection,
        {
          commentId: parentComment.id,
          body: {
            content: "a", // 1 char → violates business rule (min 2)
            parent_id: parentComment.id,
          } satisfies ICommunityPlatformComment.ICreate,
        },
      );
    },
  );
}
