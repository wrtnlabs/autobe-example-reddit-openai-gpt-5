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
 * Verify that the post author can update mutable fields and that immutable
 * relationships remain unchanged, with updated content visible via public GET.
 *
 * Flow:
 *
 * 1. Join as communityMember (Author A)
 * 2. List categories and select an active one (fallback to any if none active)
 * 3. Create a community in that category
 * 4. Create a post in that community
 * 5. Update the post's title, body, and author_display_name
 * 6. Read the post publicly and confirm the persisted updates
 *
 * Validations:
 *
 * - Title/body/author_display_name updated to new values
 * - Created_at unchanged; updated_at strictly increased
 * - Community_platform_community_id and author_user_id unchanged
 * - Public GET reflects the updated fields
 */
export async function test_api_post_update_success_by_author(
  connection: api.IConnection,
) {
  // 1) Join as communityMember (Author A)
  const joinBody = {
    username: `user_${RandomGenerator.alphabets(8)}`,
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const me: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(connection, {
      body: joinBody,
    });
  typia.assert(me);

  // 2) List categories to select an active one (fallback if empty)
  const categoriesReqActive = {
    page: 1 satisfies number as number,
    limit: 50 satisfies number as number,
    active: true,
    sortBy: "display_order",
    direction: "asc",
  } satisfies ICommunityPlatformCategory.IRequest;
  let categoriesPage = await api.functional.communityPlatform.categories.index(
    connection,
    { body: categoriesReqActive },
  );
  typia.assert(categoriesPage);

  let picked =
    categoriesPage.data.find((c) => c.active) ?? categoriesPage.data[0];
  if (!picked) {
    const categoriesReqAny = {
      page: 1 satisfies number as number,
      limit: 50 satisfies number as number,
      active: null,
      sortBy: "display_order",
      direction: "asc",
    } satisfies ICommunityPlatformCategory.IRequest;
    categoriesPage = await api.functional.communityPlatform.categories.index(
      connection,
      { body: categoriesReqAny },
    );
    typia.assert(categoriesPage);
    picked = categoriesPage.data[0];
  }
  TestValidator.predicate(
    "a category must be available for community creation",
    !!picked,
  );

  // 3) Create a community owned by Author A
  const communityBody = {
    name: `c${RandomGenerator.alphaNumeric(10)}`,
    community_platform_category_id: picked!.id,
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community: ICommunityPlatformCommunity =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      { body: communityBody },
    );
  typia.assert(community);

  // 4) Create a post in that community
  const createPostBody = {
    title: RandomGenerator.paragraph({ sentences: 6, wordMin: 4, wordMax: 10 }),
    body: RandomGenerator.content({
      paragraphs: 1,
      sentenceMin: 10,
      sentenceMax: 20,
      wordMin: 3,
      wordMax: 10,
    }),
    author_display_name: RandomGenerator.name(1),
  } satisfies ICommunityPlatformPost.ICreate;
  const post: ICommunityPlatformPost =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      {
        communityId: community.id,
        body: createPostBody,
      },
    );
  typia.assert(post);

  const prevUpdatedAt: number = Date.parse(post.updated_at);
  const prevCreatedAt: string = post.created_at;
  const prevAuthorId = post.author_user_id ?? null;
  const prevCommunityId = post.community_platform_community_id;

  // 5) Update the post (title, body, author_display_name)
  const newTitle = RandomGenerator.paragraph({
    sentences: 7,
    wordMin: 4,
    wordMax: 10,
  });
  const newBody = RandomGenerator.content({
    paragraphs: 1,
    sentenceMin: 12,
    sentenceMax: 22,
    wordMin: 3,
    wordMax: 10,
  });
  const newDisplayName = RandomGenerator.name(1);

  const updateBody = {
    title: newTitle,
    body: newBody,
    author_display_name: newDisplayName,
  } satisfies ICommunityPlatformPost.IUpdate;
  const updated: ICommunityPlatformPost =
    await api.functional.communityPlatform.communityMember.posts.update(
      connection,
      {
        postId: post.id,
        body: updateBody,
      },
    );
  typia.assert(updated);

  // Validate updated fields
  TestValidator.equals("title updated", updated.title, newTitle);
  TestValidator.equals("body updated", updated.body, newBody);
  TestValidator.equals(
    "author_display_name updated",
    updated.author_display_name ?? null,
    newDisplayName,
  );

  // Immutable fields unchanged
  TestValidator.equals(
    "community id unchanged",
    updated.community_platform_community_id,
    prevCommunityId,
  );
  TestValidator.equals(
    "author id unchanged (nullable)",
    updated.author_user_id ?? null,
    prevAuthorId,
  );

  // created_at unchanged; updated_at strictly increased
  TestValidator.equals(
    "created_at unchanged",
    updated.created_at,
    prevCreatedAt,
  );
  TestValidator.predicate(
    "updated_at increased",
    Date.parse(updated.updated_at) > prevUpdatedAt,
  );

  // 6) Public GET must reflect the updated content
  const readBack: ICommunityPlatformPost =
    await api.functional.communityPlatform.posts.at(connection, {
      postId: post.id,
    });
  typia.assert(readBack);

  TestValidator.equals("public read title matches", readBack.title, newTitle);
  TestValidator.equals("public read body matches", readBack.body, newBody);
  TestValidator.equals(
    "public read author_display_name matches",
    readBack.author_display_name ?? null,
    newDisplayName,
  );
  TestValidator.equals(
    "public read community id matches original",
    readBack.community_platform_community_id,
    prevCommunityId,
  );
  TestValidator.equals(
    "public read author id matches original (nullable)",
    readBack.author_user_id ?? null,
    prevAuthorId,
  );
  TestValidator.equals(
    "public read created_at unchanged",
    readBack.created_at,
    prevCreatedAt,
  );
  TestValidator.predicate(
    "public read updated_at >= post-update timestamp",
    Date.parse(readBack.updated_at) >= Date.parse(updated.updated_at),
  );
}
