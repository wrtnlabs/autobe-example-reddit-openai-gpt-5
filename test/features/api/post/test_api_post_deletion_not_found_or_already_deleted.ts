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
 * Validate delete behavior for non-existent and already-deleted posts.
 *
 * Business context:
 *
 * - Authenticated community members can delete their own posts. Deletion is a
 *   soft delete (deleted_at marked), removing the post from active access.
 * - Deleting a non-existent post or re-deleting an already deleted post must
 *   result in an error. E2E should verify the error behavior without asserting
 *   specific HTTP status codes.
 *
 * Steps:
 *
 * 1. Join as a community member.
 * 2. Part A: Try deleting a random (presumed non-existent) UUID → expect error.
 * 3. List active categories and select one.
 * 4. Create a community under the selected category (name follows pattern).
 * 5. Create a post in the community.
 * 6. Delete the post (success path).
 * 7. Try deleting the same post again → expect error.
 */
export async function test_api_post_deletion_not_found_or_already_deleted(
  connection: api.IConnection,
) {
  // 1) Join as a community member
  const joinBody = {
    username: `user_${RandomGenerator.alphaNumeric(8)}`,
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const auth = await api.functional.auth.communityMember.join(connection, {
    body: joinBody,
  });
  typia.assert(auth);

  // 2) Part A: delete non-existent post → expect error
  const nonexistentPostId = typia.random<string & tags.Format<"uuid">>();
  await TestValidator.error(
    "Part A: deleting non-existent post should throw",
    async () => {
      await api.functional.communityPlatform.communityMember.posts.erase(
        connection,
        { postId: nonexistentPostId },
      );
    },
  );

  // 3) List categories and select one active category
  const categoriesPage =
    await api.functional.communityPlatform.categories.index(connection, {
      body: {
        active: true,
        limit: 50,
      } satisfies ICommunityPlatformCategory.IRequest,
    });
  typia.assert(categoriesPage);
  TestValidator.predicate(
    "at least one active category must exist",
    categoriesPage.data.length > 0,
  );
  const categoryId = categoriesPage.data[0].id;

  // 4) Create a community (name pattern: ^[A-Za-z][A-Za-z0-9_-]{1,30}[A-Za-z0-9]$)
  const communityName = (() => {
    const head = RandomGenerator.alphabets(1); // leading letter [a-z]
    const mid = RandomGenerator.alphaNumeric(6); // letters/digits
    return `${head}${mid}`; // ends with alphanumeric
  })();
  const communityBody = {
    name: communityName,
    community_platform_category_id: categoryId,
    description: RandomGenerator.paragraph({ sentences: 8 }),
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      { body: communityBody },
    );
  typia.assert(community);

  // 5) Create a post in the community
  const postBody = {
    title: RandomGenerator.paragraph({ sentences: 5 }),
    body: RandomGenerator.content({
      paragraphs: 2,
      sentenceMin: 8,
      sentenceMax: 12,
      wordMin: 3,
      wordMax: 8,
    }),
    author_display_name: RandomGenerator.name(1),
  } satisfies ICommunityPlatformPost.ICreate;
  const post =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      { communityId: community.id, body: postBody },
    );
  typia.assert(post);

  // 6) Delete the post (success path - void response)
  await api.functional.communityPlatform.communityMember.posts.erase(
    connection,
    { postId: post.id },
  );

  // 7) Delete the same post again → expect error
  await TestValidator.error(
    "Part B: deleting already-deleted post should throw",
    async () => {
      await api.functional.communityPlatform.communityMember.posts.erase(
        connection,
        { postId: post.id },
      );
    },
  );
}
