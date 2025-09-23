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
 * Verify that comment search can filter strictly by post_id with a keyword,
 * ordering by Newest (created_at desc), without duplicates and with proper
 * pagination metadata. Also verify unknown post_id returns empty results.
 *
 * Steps:
 *
 * 1. Join as a community member (auth) to enable content creation.
 * 2. Fetch an active category and create a community.
 * 3. Create two posts within the community: Post A and Post B.
 * 4. Create two comments under each post (A1, A2, B1, B2), all containing the
 *    keyword "hangang" to ensure query hits across posts.
 * 5. Search comments with query="hangang" and post_id=PostA.id, and validate:
 *
 *    - All results belong to Post A only
 *    - Results include A1 and A2, and exclude B1 and B2
 *    - Results are sorted by created_at desc and contain no duplicates
 *    - Pagination metadata is coherent
 * 6. Edge case: search with query and an unknown post_id → empty result set.
 */
export async function test_api_comment_search_filter_by_post(
  connection: api.IConnection,
) {
  // 1) Authenticate as a community member
  const username: string = `member_${RandomGenerator.alphaNumeric(8)}`;
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const password: string = `pw_${RandomGenerator.alphaNumeric(10)}`; // >= 8 chars
  const authorized: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(connection, {
      body: {
        username,
        email,
        password,
      } satisfies ICommunityPlatformCommunityMember.ICreate,
    });
  typia.assert(authorized);

  // 2) Fetch an active category and create a community
  const catPage = await api.functional.communityPlatform.categories.index(
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
  typia.assert(catPage);
  TestValidator.predicate(
    "at least one active category exists",
    catPage.data.length >= 1,
  );
  const categoryId = catPage.data[0].id;

  const communityName = `c${RandomGenerator.alphaNumeric(10)}`; // matches ^[A-Za-z][A-Za-z0-9_-]{1,30}[A-Za-z0-9]$
  const community: ICommunityPlatformCommunity =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      {
        body: {
          name: communityName,
          community_platform_category_id: categoryId,
          description: RandomGenerator.paragraph({ sentences: 8 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);

  // 3) Create two posts (A and B)
  const postABody = {
    title: RandomGenerator.paragraph({ sentences: 5 }),
    body: RandomGenerator.content({
      paragraphs: 2,
      sentenceMin: 8,
      sentenceMax: 16,
    }),
  } satisfies ICommunityPlatformPost.ICreate;
  const postBBody = {
    title: RandomGenerator.paragraph({ sentences: 6 }),
    body: RandomGenerator.content({
      paragraphs: 2,
      sentenceMin: 8,
      sentenceMax: 16,
    }),
  } satisfies ICommunityPlatformPost.ICreate;

  const postA: ICommunityPlatformPost =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      {
        communityId: community.id,
        body: postABody,
      },
    );
  typia.assert(postA);

  const postB: ICommunityPlatformPost =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      {
        communityId: community.id,
        body: postBBody,
      },
    );
  typia.assert(postB);

  // 4) Create two keyword-bearing comments under each post
  const keyword = "hangang";
  const commentBodyA1 = {
    content: `${keyword} ${RandomGenerator.paragraph({ sentences: 6 })}`,
  } satisfies ICommunityPlatformComment.ICreate;
  const commentBodyA2 = {
    content: `${keyword} ${RandomGenerator.paragraph({ sentences: 7 })}`,
  } satisfies ICommunityPlatformComment.ICreate;
  const commentBodyB1 = {
    content: `${keyword} ${RandomGenerator.paragraph({ sentences: 6 })}`,
  } satisfies ICommunityPlatformComment.ICreate;
  const commentBodyB2 = {
    content: `${keyword} ${RandomGenerator.paragraph({ sentences: 7 })}`,
  } satisfies ICommunityPlatformComment.ICreate;

  const a1: ICommunityPlatformComment =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      connection,
      { postId: postA.id, body: commentBodyA1 },
    );
  typia.assert(a1);

  const a2: ICommunityPlatformComment =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      connection,
      { postId: postA.id, body: commentBodyA2 },
    );
  typia.assert(a2);

  const b1: ICommunityPlatformComment =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      connection,
      { postId: postB.id, body: commentBodyB1 },
    );
  typia.assert(b1);

  const b2: ICommunityPlatformComment =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      connection,
      { postId: postB.id, body: commentBodyB2 },
    );
  typia.assert(b2);

  // 5) Execute search with post_id filter = Post A
  const searchPage: IPageICommunityPlatformComment.ISummary =
    await api.functional.communityPlatform.search.comments.index(connection, {
      body: {
        query: keyword,
        post_id: postA.id,
        limit: 50,
        page: 0,
        sort: "Newest",
      } satisfies ICommunityPlatformComment.IRequest,
    });
  typia.assert(searchPage);

  const results = searchPage.data;

  // Scope correctness: all results must belong to Post A
  TestValidator.predicate(
    "all results belong to Post A",
    results.every((c) => c.community_platform_post_id === postA.id),
  );

  // Inclusion/exclusion checks
  const ids = new Set(results.map((c) => c.id));
  TestValidator.predicate(
    "results include both A1 and A2",
    ids.has(a1.id) && ids.has(a2.id),
  );
  TestValidator.predicate(
    "results exclude B1 and B2",
    !ids.has(b1.id) && !ids.has(b2.id),
  );

  // Ordering: Newest (created_at desc) and no duplicates
  const uniqueCount = ids.size;
  TestValidator.equals(
    "no duplicate ids in results",
    uniqueCount,
    results.length,
  );
  const isDesc = results.every((curr, idx, arr) =>
    idx === 0
      ? true
      : new Date(arr[idx - 1].created_at).getTime() >=
        new Date(curr.created_at).getTime(),
  );
  TestValidator.predicate(
    "results are ordered by created_at desc (Newest)",
    isDesc,
  );

  // Pagination metadata checks
  TestValidator.predicate(
    "pagination.records is not less than items in current page",
    searchPage.pagination.records >= results.length,
  );
  TestValidator.predicate(
    "at least two results returned for Post A keyword",
    results.length >= 2,
  );

  // 6) Edge case: unknown post_id returns empty results
  const unknownPostId = typia.random<string & tags.Format<"uuid">>();
  const emptyPage =
    await api.functional.communityPlatform.search.comments.index(connection, {
      body: {
        query: keyword,
        post_id: unknownPostId,
        limit: 20,
        page: 0,
        sort: "Newest",
      } satisfies ICommunityPlatformComment.IRequest,
    });
  typia.assert(emptyPage);
  TestValidator.equals(
    "unknown post_id yields empty data list",
    emptyPage.data.length,
    0,
  );
  TestValidator.equals(
    "unknown post_id yields zero records",
    emptyPage.pagination.records,
    0,
  );
}
