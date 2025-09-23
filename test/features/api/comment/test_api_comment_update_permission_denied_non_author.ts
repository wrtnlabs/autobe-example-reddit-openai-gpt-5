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
 * Non-author comment update must be denied and content must remain unchanged.
 *
 * Flow:
 *
 * 1. Join as User A (auth issued automatically by SDK).
 * 2. Discover a category and create a community as User A.
 * 3. Create a post in that community as User A.
 * 4. Create a comment on the post as User A; capture commentId and original
 *    content.
 * 5. Join as User B (auth switches to B automatically).
 * 6. Attempt to update User A’s comment as User B → expect error (permission
 *    denied).
 * 7. GET the comment and confirm its content is unchanged.
 */
export async function test_api_comment_update_permission_denied_non_author(
  connection: api.IConnection,
) {
  // 1) Join as User A
  const userAJoinBody = {
    username: `userA_${RandomGenerator.alphaNumeric(10)}`,
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12), // >= 8 chars
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const userAAuth: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(connection, {
      body: userAJoinBody,
    });
  typia.assert(userAAuth);

  // 2) Discover a category (active, 1 item is enough)
  const categoriesPage =
    await api.functional.communityPlatform.categories.index(connection, {
      body: {
        active: true,
        limit: 5,
      } satisfies ICommunityPlatformCategory.IRequest,
    });
  typia.assert(categoriesPage);
  TestValidator.predicate(
    "at least one category should exist for community creation",
    categoriesPage.data.length > 0,
  );
  const categoryId = categoriesPage.data[0].id;

  // 3) Create a community under the found category
  const communityName = `c${RandomGenerator.alphaNumeric(8)}`; // starts with letter, alnum tail
  const createCommunityBody = {
    name: communityName,
    community_platform_category_id: categoryId,
    description: RandomGenerator.paragraph({ sentences: 8 }),
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      { body: createCommunityBody },
    );
  typia.assert(community);

  // 4) Create a post in the community
  const createPostBody = {
    title: RandomGenerator.paragraph({ sentences: 6, wordMin: 3, wordMax: 10 }),
    body: RandomGenerator.content({
      paragraphs: 1,
      sentenceMin: 12,
      sentenceMax: 20,
      wordMin: 3,
      wordMax: 9,
    }),
  } satisfies ICommunityPlatformPost.ICreate;
  const post =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      { communityId: community.id, body: createPostBody },
    );
  typia.assert(post);

  // 5) Create a comment on the post as User A
  const createCommentBody = {
    content: RandomGenerator.paragraph({ sentences: 12 }),
  } satisfies ICommunityPlatformComment.ICreate;
  const comment =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      connection,
      { postId: post.id, body: createCommentBody },
    );
  typia.assert(comment);
  const originalContent = comment.content;

  // 6) Join as User B (switch auth context)
  const userBJoinBody = {
    username: `userB_${RandomGenerator.alphaNumeric(10)}`,
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const userBAuth: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(connection, {
      body: userBJoinBody,
    });
  typia.assert(userBAuth);

  // 7) Attempt to update the comment as non-author → expect error
  const updateBody = {
    content: RandomGenerator.paragraph({ sentences: 5 }),
  } satisfies ICommunityPlatformComment.IUpdate;
  await TestValidator.error(
    "non-author cannot update someone else's comment",
    async () => {
      const attempted =
        await api.functional.communityPlatform.communityMember.comments.update(
          connection,
          { commentId: comment.id, body: updateBody },
        );
      // If it (unexpectedly) succeeds, validate type to ensure failure of TestValidator.error
      typia.assert(attempted);
    },
  );

  // Verify content remains unchanged
  const reloaded = await api.functional.communityPlatform.comments.at(
    connection,
    {
      commentId: comment.id,
    },
  );
  typia.assert(reloaded);
  TestValidator.equals(
    "comment content remains unchanged after failed update by non-author",
    reloaded.content,
    originalContent,
  );
}
