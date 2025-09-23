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
 * Ensure non-author cannot update another user's post and that the post remains
 * unchanged.
 *
 * Business workflow
 *
 * 1. Join as communityMember (Author A).
 * 2. List categories (active) and select one to create a community.
 * 3. Author A creates a post in the community (capture original fields and
 *    updated_at).
 * 4. Switch actor: Join as communityMember (Member B).
 * 5. Member B attempts to update Author A’s post with a valid payload – expect
 *    failure.
 * 6. GET the post again to confirm title/body/author_display_name/updated_at are
 *    unchanged.
 *
 * Validation notes
 *
 * - Use typia.assert for all responses.
 * - Use TestValidator.error for the forbidden update (do not assert status code
 *   or message).
 * - Equality checks use actual-first, expected-second ordering.
 */
export async function test_api_post_update_forbidden_by_non_author(
  connection: api.IConnection,
) {
  // 1) Join as communityMember (Author A)
  const authorAJoinBody = {
    username: `user_${RandomGenerator.alphaNumeric(8)}`,
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(10), // >= 8 chars
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const authorA = await api.functional.auth.communityMember.join(connection, {
    body: authorAJoinBody,
  });
  typia.assert(authorA);

  // 2) List categories (active) and select one
  const categoriesPage =
    await api.functional.communityPlatform.categories.index(connection, {
      body: {
        active: true,
        limit: 1,
        sortBy: "display_order",
        direction: "asc",
      } satisfies ICommunityPlatformCategory.IRequest,
    });
  typia.assert(categoriesPage);
  TestValidator.predicate(
    "at least one active category exists",
    categoriesPage.data.length > 0,
  );
  const categoryId = categoriesPage.data[0].id;

  // 3) Create a community as Author A
  const communityName = `c${RandomGenerator.alphaNumeric(6)}`; // starts with a letter, ends alnum
  const community =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      {
        body: {
          name: communityName,
          community_platform_category_id: categoryId,
          description: RandomGenerator.paragraph({ sentences: 6 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);

  // 4) Author A creates a post in the community
  const createPostBody = {
    title: `Forbidden update test ${RandomGenerator.alphabets(8)}`,
    body: RandomGenerator.content({
      paragraphs: 1,
      sentenceMin: 10,
      sentenceMax: 15,
      wordMin: 3,
      wordMax: 8,
    }),
    author_display_name: RandomGenerator.name(1),
  } satisfies ICommunityPlatformPost.ICreate;
  const post =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      {
        communityId: community.id,
        body: createPostBody,
      },
    );
  typia.assert(post);

  const originalPost = post; // preserve snapshot to compare later

  // 5) Switch actor: Join as communityMember (Member B)
  const memberBJoinBody = {
    username: `user_${RandomGenerator.alphaNumeric(8)}`,
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const memberB = await api.functional.auth.communityMember.join(connection, {
    body: memberBJoinBody,
  });
  typia.assert(memberB);

  // 6) Member B attempts to update the post (should fail)
  const updateAttemptBody = {
    title: `Hacked ${RandomGenerator.alphabets(6)}`,
    body: RandomGenerator.content({
      paragraphs: 1,
      sentenceMin: 8,
      sentenceMax: 12,
    }),
    author_display_name: RandomGenerator.name(1),
  } satisfies ICommunityPlatformPost.IUpdate;
  await TestValidator.error(
    "non-author cannot update someone else's post",
    async () => {
      await api.functional.communityPlatform.communityMember.posts.update(
        connection,
        {
          postId: originalPost.id,
          body: updateAttemptBody,
        },
      );
    },
  );

  // 7) GET the post again and confirm no changes
  const reloaded = await api.functional.communityPlatform.posts.at(connection, {
    postId: originalPost.id,
  });
  typia.assert(reloaded);

  TestValidator.equals(
    "title unchanged after forbidden update",
    reloaded.title,
    originalPost.title,
  );
  TestValidator.equals(
    "body unchanged after forbidden update",
    reloaded.body,
    originalPost.body,
  );
  TestValidator.equals(
    "author_display_name unchanged after forbidden update",
    reloaded.author_display_name,
    originalPost.author_display_name,
  );
  TestValidator.equals(
    "updated_at unchanged after forbidden update",
    reloaded.updated_at,
    originalPost.updated_at,
  );
}
