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
 * Ensure non-author cannot delete another user's post.
 *
 * Business flow:
 *
 * 1. Author A joins as communityMember.
 * 2. List active categories and pick one to create a community.
 * 3. Author A creates a community and then a post in it.
 * 4. Member B (different user) joins.
 * 5. Member B tries to DELETE the post (should throw an authorization error).
 * 6. Verify the post still exists by fetching it.
 *
 * Notes:
 *
 * - Do not assert specific HTTP status codes or error messages; only assert that
 *   an error occurs.
 */
export async function test_api_post_deletion_forbidden_by_non_author(
  connection: api.IConnection,
) {
  // 1) Author A joins
  const authorJoinBody = {
    username: `author_${RandomGenerator.alphaNumeric(8)}`,
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const authorAuth = await api.functional.auth.communityMember.join(
    connection,
    {
      body: authorJoinBody,
    },
  );
  typia.assert(authorAuth);

  // 2) Discover an active category
  const categoryRequest = {
    page: 1,
    limit: 5,
    active: true,
    sortBy: "display_order",
    direction: "asc",
  } satisfies ICommunityPlatformCategory.IRequest;
  const categoriesPage =
    await api.functional.communityPlatform.categories.index(connection, {
      body: categoryRequest,
    });
  typia.assert(categoriesPage);
  TestValidator.predicate(
    "at least one active category exists",
    categoriesPage.data.length > 0,
  );
  const categoryId = categoriesPage.data[0].id;

  // 3) Create a community
  const communityName = `${RandomGenerator.alphabets(1)}${RandomGenerator.alphaNumeric(7)}`; // 8 chars, valid pattern
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

  // 4) Author A creates a post in the community
  const postBody = {
    title: RandomGenerator.paragraph({ sentences: 3 }),
    body: RandomGenerator.content({
      paragraphs: 1,
      sentenceMin: 12,
      sentenceMax: 18,
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
        body: postBody,
      },
    );
  typia.assert(post);

  // 5) Member B joins (switches auth context via SDK-managed headers)
  const memberBJoinBody = {
    username: `memberB_${RandomGenerator.alphaNumeric(8)}`,
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const memberBAuth = await api.functional.auth.communityMember.join(
    connection,
    { body: memberBJoinBody },
  );
  typia.assert(memberBAuth);

  // 6) Member B attempts to delete Author A's post → should fail
  await TestValidator.error(
    "non-author cannot delete another user's post",
    async () => {
      await api.functional.communityPlatform.communityMember.posts.erase(
        connection,
        { postId: post.id },
      );
    },
  );

  // 7) Verify the post still exists
  const read = await api.functional.communityPlatform.posts.at(connection, {
    postId: post.id,
  });
  typia.assert(read);
  TestValidator.equals(
    "post remains accessible after forbidden delete attempt",
    read.id,
    post.id,
  );
}
