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
import type { IPageICommunityPlatformPost } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformPost";

export async function test_api_post_search_by_community_filter(
  connection: api.IConnection,
) {
  /**
   * Validate post search filtering by community.
   *
   * Steps:
   *
   * 1. Authenticate (join) a community member.
   * 2. Load an active category for community creation.
   * 3. Create two communities (A, B).
   * 4. Seed posts: 2 in A, 1 in B.
   * 5. Search posts filtered by community_id=A.
   * 6. Validate: all results belong to A, none to B, and ordering is newest-first.
   */

  // 1) Authenticate (join) a community member
  const joinBody = {
    username: `user_${RandomGenerator.alphaNumeric(10)}`,
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12), // >= 8 chars as required
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const authorized: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(connection, {
      body: joinBody,
    });
  typia.assert(authorized);

  // 2) Discover an active category
  const categoriesPage =
    await api.functional.communityPlatform.categories.index(connection, {
      body: {
        page: 1,
        limit: 10,
        active: true,
      } satisfies ICommunityPlatformCategory.IRequest,
    });
  typia.assert(categoriesPage);
  const category = categoriesPage.data[0];
  if (!category)
    throw new Error("No category available to create communities.");

  // Helper to generate a valid community name (letters/digits only)
  const genCommunityName = (prefix: string) =>
    `${prefix}${RandomGenerator.alphaNumeric(10)}`; // starts with letter via prefix; length >= 3

  // 3) Create two communities (A, B)
  const communityABody = {
    name: genCommunityName("alpha"),
    community_platform_category_id: category.id,
  } satisfies ICommunityPlatformCommunity.ICreate;
  const communityA =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      { body: communityABody },
    );
  typia.assert(communityA);

  const communityBBody = {
    name: genCommunityName("beta"),
    community_platform_category_id: category.id,
  } satisfies ICommunityPlatformCommunity.ICreate;
  const communityB =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      { body: communityBBody },
    );
  typia.assert(communityB);

  // 4) Seed posts: 2 in A, 1 in B
  const mkTitle = () => {
    const t = RandomGenerator.paragraph({
      sentences: 5,
      wordMin: 3,
      wordMax: 8,
    });
    return t.length >= 5 ? t : `${t} title`;
  };
  const mkBody = () =>
    RandomGenerator.content({
      paragraphs: 1,
      sentenceMin: 12,
      sentenceMax: 20,
      wordMin: 3,
      wordMax: 8,
    });

  const createPostA1Body = {
    title: mkTitle(),
    body: mkBody(),
    author_display_name: RandomGenerator.name(1),
  } satisfies ICommunityPlatformPost.ICreate;
  const postA1 =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      { communityId: communityA.id, body: createPostA1Body },
    );
  typia.assert(postA1);

  const createPostA2Body = {
    title: mkTitle(),
    body: mkBody(),
    author_display_name: RandomGenerator.name(1),
  } satisfies ICommunityPlatformPost.ICreate;
  const postA2 =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      { communityId: communityA.id, body: createPostA2Body },
    );
  typia.assert(postA2);

  const createPostB1Body = {
    title: mkTitle(),
    body: mkBody(),
    author_display_name: RandomGenerator.name(1),
  } satisfies ICommunityPlatformPost.ICreate;
  const postB1 =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      { communityId: communityB.id, body: createPostB1Body },
    );
  typia.assert(postB1);

  // 5) Search posts restricted to community A
  const requestA = {
    page: 1,
    limit: 50, // generous limit to include freshly created posts
    community_id: communityA.id,
    // sort omitted => defaults to "newest"
  } satisfies ICommunityPlatformPost.IRequest;
  const pageA = await api.functional.communityPlatform.posts.index(connection, {
    body: requestA,
  });
  typia.assert(pageA);

  // 6) Validations
  // 6-1) All returned posts belong to community A
  TestValidator.predicate(
    "all results are scoped to community A",
    pageA.data.every(
      (p) => p.community_platform_community_id === communityA.id,
    ),
  );

  // 6-2) None belong to community B
  TestValidator.predicate(
    "no results from community B are included",
    pageA.data.every(
      (p) => p.community_platform_community_id !== communityB.id,
    ),
  );

  // 6-3) Newest-first ordering (created_at descending)
  const isDesc = (arr: readonly ICommunityPlatformPost.ISummary[]) =>
    arr.every((p, i) =>
      i === 0 ? true : arr[i - 1].created_at >= p.created_at,
    );
  TestValidator.predicate(
    "results are ordered by created_at DESC (newest-first)",
    isDesc(pageA.data),
  );

  // 6-4) Created A posts should appear in filtered results (best-effort check)
  const idsA = new Set(pageA.data.map((d) => d.id));
  TestValidator.predicate(
    "postA1 is listed in community A results (best-effort)",
    idsA.has(postA1.id),
  );
  TestValidator.predicate(
    "postA2 is listed in community A results (best-effort)",
    idsA.has(postA2.id),
  );

  // 6-5) Ensure B's post is not present
  TestValidator.predicate(
    "postB1 is not listed in community A results",
    !idsA.has(postB1.id),
  );
}
