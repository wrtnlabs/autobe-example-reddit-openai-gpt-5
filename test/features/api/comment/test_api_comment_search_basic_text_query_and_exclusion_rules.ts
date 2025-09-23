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
 * Verify comment text search includes only public, non-deleted comments and
 * excludes comments that are soft-deleted or belong to soft-deleted posts. Also
 * verify pagination metadata and Newest ordering.
 *
 * Steps:
 *
 * 1. Join as community member (for content creation/deletion capabilities).
 * 2. List categories; pick an active one.
 * 3. Create a community in the chosen category.
 * 4. Create Post A and Post B under the community.
 * 5. Under Post A, create C1 (with "seoul"), C2 (with "seoul"), C3 (without).
 * 6. Soft-delete C2.
 * 7. Under Post B, create C4 (with "seoul") and soft-delete Post B.
 * 8. Search comments with query="seoul" using a `since` captured just before
 *    comment creation.
 * 9. Validate that only C1 appears; C2 (deleted) and C4 (post deleted) do not.
 */
export async function test_api_comment_search_basic_text_query_and_exclusion_rules(
  connection: api.IConnection,
) {
  // 1) Authenticate (join) as a community member
  const joinBody = {
    username: `user_${RandomGenerator.alphabets(8)}`,
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const me = await api.functional.auth.communityMember.join(connection, {
    body: joinBody,
  });
  typia.assert(me);

  // 2) List categories and choose an active one
  const catReq = {
    active: true,
    limit: 50,
  } satisfies ICommunityPlatformCategory.IRequest;
  const categories = await api.functional.communityPlatform.categories.index(
    connection,
    { body: catReq },
  );
  typia.assert(categories);
  await TestValidator.predicate(
    "at least one active category should exist",
    async () => categories.data.length > 0,
  );
  const category = RandomGenerator.pick(categories.data);

  // 3) Create a community
  const communityName = `c-${RandomGenerator.alphaNumeric(10)}`; // starts with letter, length <= 32
  const communityBody = {
    name: communityName,
    community_platform_category_id: category.id,
    description: RandomGenerator.paragraph({ sentences: 6 }),
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      { body: communityBody },
    );
  typia.assert(community);

  // 4) Create Post A and Post B
  const postABody = {
    title: RandomGenerator.paragraph({ sentences: 5 }),
    body: RandomGenerator.content({
      paragraphs: 1,
      sentenceMin: 8,
      sentenceMax: 15,
    }),
    author_display_name: RandomGenerator.name(1),
  } satisfies ICommunityPlatformPost.ICreate;
  const postBBody = {
    title: RandomGenerator.paragraph({ sentences: 5 }),
    body: RandomGenerator.content({
      paragraphs: 1,
      sentenceMin: 8,
      sentenceMax: 15,
    }),
    author_display_name: RandomGenerator.name(1),
  } satisfies ICommunityPlatformPost.ICreate;

  const postA =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      { communityId: community.id, body: postABody },
    );
  typia.assert(postA);

  const postB =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      { communityId: community.id, body: postBBody },
    );
  typia.assert(postB);

  // Capture since before any comment creation to scope search
  const since = new Date().toISOString();

  // 5) Create comments under Post A: C1 (with keyword), C2 (with keyword), C3 (without)
  const c1 =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      connection,
      {
        postId: postA.id,
        body: {
          content: "seoul travel tips and experiences",
        } satisfies ICommunityPlatformComment.ICreate,
      },
    );
  typia.assert(c1);

  const c2 =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      connection,
      {
        postId: postA.id,
        body: {
          content: "best cafes in seoul city center",
        } satisfies ICommunityPlatformComment.ICreate,
      },
    );
  typia.assert(c2);

  const c3 =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      connection,
      {
        postId: postA.id,
        body: {
          content: "weekend getaway ideas",
        } satisfies ICommunityPlatformComment.ICreate,
      },
    );
  typia.assert(c3);

  // 6) Soft-delete C2
  await api.functional.communityPlatform.communityMember.comments.erase(
    connection,
    { commentId: c2.id },
  );

  // 7) Under Post B, create C4 (with keyword) then soft-delete Post B
  const c4 =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      connection,
      {
        postId: postB.id,
        body: {
          content: "seoul nightlife guide",
        } satisfies ICommunityPlatformComment.ICreate,
      },
    );
  typia.assert(c4);

  await api.functional.communityPlatform.communityMember.posts.erase(
    connection,
    { postId: postB.id },
  );

  // 8) Search comments with query = "seoul"
  const searchBody = {
    query: "seoul",
    page: 0,
    limit: 50,
    since,
    sort: "Newest",
    top_level_only: true,
  } satisfies ICommunityPlatformComment.IRequest;
  const page = await api.functional.communityPlatform.search.comments.index(
    connection,
    { body: searchBody },
  );
  typia.assert(page);

  // 9) Validations
  TestValidator.predicate(
    "search results should include C1 and exclude C2 (deleted) and C4 (post deleted)",
    page.data.some((d) => d.id === c1.id) &&
      page.data.every((d) => d.id !== c2.id && d.id !== c4.id),
  );

  // Ensure every item matches the query intent (defensive)
  TestValidator.predicate(
    "every returned comment content contains the keyword 'seoul'",
    page.data.every((d) => d.content.toLowerCase().includes("seoul")),
  );

  // Pagination metadata sanity: records should be >= returned length
  TestValidator.predicate(
    "pagination.records should be greater than or equal to returned items length",
    page.pagination.records >= page.data.length,
  );

  // With our constraints, we expect exactly one visible item (C1)
  TestValidator.equals(
    "exactly one visible match after exclusions",
    page.data.length,
    1,
  );
  TestValidator.equals("the only returned item is C1", page.data[0]?.id, c1.id);

  // Ordering check (Newest): created_at desc
  const isSortedDesc = page.data.every((v, i, arr) =>
    i === 0 ? true : arr[i - 1].created_at >= v.created_at,
  );
  TestValidator.predicate(
    "results are ordered by Newest (created_at desc)",
    isSortedDesc,
  );
}
