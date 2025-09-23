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
 * Verify global comment search enforces visibility rules and Newest ordering.
 *
 * Business goal:
 *
 * - Only visible comments should be returned: exclude comments that are
 *   soft-deleted and comments belonging to soft-deleted posts.
 * - Ordering must follow Newest (created_at DESC, tie by larger id).
 *
 * Test flow:
 *
 * 1. Authenticate by joining as a communityMember.
 * 2. Discover an active category.
 * 3. Create a community under that category.
 * 4. Create two posts (P1, P2) in the community.
 * 5. Under P1, create two comments containing a unique search token; then
 *    soft-delete one of them.
 * 6. Under P2, create one comment containing the token; then soft-delete P2.
 * 7. Execute target search with the unique token and sort=Newest.
 * 8. Validate: only the non-deleted comment from P1 appears, nothing from P2,
 *    ordering is Newest, and pagination is consistent.
 *
 * Note:
 *
 * - The short-query (length 1) error scenario from the draft is omitted because
 *   ICommunityPlatformComment.IRequest enforces query min length (>=2) at the
 *   type level. Intentionally violating DTO constraints is forbidden.
 */
export async function test_api_comment_search_query_min_length_and_visibility_filters(
  connection: api.IConnection,
) {
  // 1) Authenticate (join as community member)
  const username: string = `user_${RandomGenerator.alphaNumeric(8)}`;
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const password: string = RandomGenerator.alphaNumeric(12);
  const authorized: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(connection, {
      body: {
        username,
        email,
        password,
      } satisfies ICommunityPlatformCommunityMember.ICreate,
    });
  typia.assert(authorized);

  // 2) Discover an active category
  const categories: IPageICommunityPlatformCategory.ISummary =
    await api.functional.communityPlatform.categories.index(connection, {
      body: {
        page: 1, // IRequest.minimum<1>
        limit: 10,
        active: true,
      } satisfies ICommunityPlatformCategory.IRequest,
    });
  typia.assert(categories);
  TestValidator.predicate(
    "at least one active category exists",
    categories.data.length > 0,
  );
  const category = categories.data[0];

  // 3) Create a community under the chosen category
  const community: ICommunityPlatformCommunity =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      {
        body: {
          name: `c${RandomGenerator.alphaNumeric(10)}`,
          community_platform_category_id: category.id,
          description: RandomGenerator.paragraph({ sentences: 6 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);

  // 4) Create two posts (P1, P2) in the community
  const p1: ICommunityPlatformPost =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      {
        communityId: community.id,
        body: {
          title: RandomGenerator.paragraph({ sentences: 5 }),
          body: RandomGenerator.content({ paragraphs: 2 }),
        } satisfies ICommunityPlatformPost.ICreate,
      },
    );
  typia.assert(p1);

  const p2: ICommunityPlatformPost =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      {
        communityId: community.id,
        body: {
          title: RandomGenerator.paragraph({ sentences: 5 }),
          body: RandomGenerator.content({ paragraphs: 2 }),
        } satisfies ICommunityPlatformPost.ICreate,
      },
    );
  typia.assert(p2);

  // 5) Create comments under P1, delete one later
  const token = `Nimbus-${RandomGenerator.alphaNumeric(8)}`;

  const c1_visible: ICommunityPlatformComment =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      connection,
      {
        postId: p1.id,
        body: {
          content: `${token} first visible comment`,
        } satisfies ICommunityPlatformComment.ICreate,
      },
    );
  typia.assert(c1_visible);

  const c1_deleted: ICommunityPlatformComment =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      connection,
      {
        postId: p1.id,
        body: {
          content: `${token} to be deleted`,
        } satisfies ICommunityPlatformComment.ICreate,
      },
    );
  typia.assert(c1_deleted);

  // Soft-delete one of P1's comments
  await api.functional.communityPlatform.communityMember.comments.erase(
    connection,
    { commentId: c1_deleted.id },
  );

  // 6) Create a comment under P2, then soft-delete P2
  const c2_on_p2: ICommunityPlatformComment =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      connection,
      {
        postId: p2.id,
        body: {
          content: `${token} on deleted post`,
        } satisfies ICommunityPlatformComment.ICreate,
      },
    );
  typia.assert(c2_on_p2);

  await api.functional.communityPlatform.communityMember.posts.erase(
    connection,
    { postId: p2.id },
  );

  // 7) Execute target search with the unique token, sort=Newest
  const searchPage: IPageICommunityPlatformComment =
    await api.functional.communityPlatform.comments.index(connection, {
      body: {
        page: 0, // IRequest.minimum<0>
        limit: 50,
        query: token,
        sort: "Newest",
      } satisfies ICommunityPlatformComment.IRequest,
    });
  typia.assert(searchPage);

  // 8) Validations
  // 8.1) Ensure no results belong to the deleted post P2
  TestValidator.predicate(
    "no comment from the deleted post should appear",
    searchPage.data.every((c) => c.community_platform_post_id !== p2.id),
  );

  // 8.2) Ensure the soft-deleted comment is excluded
  TestValidator.predicate(
    "soft-deleted comment is excluded from results",
    searchPage.data.every((c) => c.id !== c1_deleted.id),
  );

  // 8.3) Ensure the visible comment is included and uniqueness holds for token
  const matching = searchPage.data.filter((c) => c.content.includes(token));
  TestValidator.equals(
    "only one matching comment should be returned for unique token",
    matching.length,
    1,
  );
  TestValidator.predicate(
    "the remaining visible P1 comment is included",
    matching.some((c) => c.id === c1_visible.id),
  );

  // 8.4) Verify Newest ordering (created_at DESC, tie-breaker by id DESC)
  const actualIds = searchPage.data.map((c) => c.id);
  const expectedIds = searchPage.data
    .slice()
    .sort(
      (a, b) =>
        b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id),
    )
    .map((c) => c.id);
  TestValidator.equals(
    "results are ordered by Newest (created_at desc, id desc)",
    actualIds,
    expectedIds,
  );

  // 8.5) Basic pagination invariants
  TestValidator.predicate(
    "pagination.records is at least returned data length",
    searchPage.pagination.records >= searchPage.data.length,
  );
}
