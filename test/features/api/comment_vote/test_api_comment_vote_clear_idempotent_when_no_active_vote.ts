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
 * Validate idempotent behavior of clearing a comment vote when no active vote
 * exists.
 *
 * Scenario summary:
 *
 * - User A (author) creates a community, a post within it, and a comment.
 * - User B (voter) has no active vote on that comment.
 * - User B calls DELETE
 *   /communityPlatform/communityMember/comments/{commentId}/votes twice.
 * - Both calls must succeed without errors (void/204 semantics), proving
 *   idempotency.
 *
 * Steps:
 *
 * 1. Join as User A (author)
 * 2. Fetch a category and create a community (as User A)
 * 3. Create a post (as User A)
 * 4. Create a comment on the post (as User A)
 * 5. Join as User B (voter) to set caller context
 * 6. Call votes.erase(commentId) twice without any prior vote
 *
 * Notes:
 *
 * - We only validate that both operations complete successfully; we do not
 *   inspect HTTP status codes.
 * - All request bodies use `satisfies` with correct DTO variants.
 */
export async function test_api_comment_vote_clear_idempotent_when_no_active_vote(
  connection: api.IConnection,
) {
  // 1) Join as User A (author)
  const authorAuth = await api.functional.auth.communityMember.join(
    connection,
    {
      body: {
        username: `author_${RandomGenerator.alphaNumeric(8)}`,
        email: typia.random<string & tags.Format<"email">>(),
        password: `P@ssw0rd_${RandomGenerator.alphaNumeric(8)}`,
      } satisfies ICommunityPlatformCommunityMember.ICreate,
    },
  );
  typia.assert(authorAuth);

  // 2) Fetch at least one active category for community creation
  const categoriesPage =
    await api.functional.communityPlatform.categories.index(connection, {
      body: {
        page: 1,
        limit: 1,
        active: true,
        sortBy: "display_order",
        direction: "asc",
      } satisfies ICommunityPlatformCategory.IRequest,
    });
  typia.assert(categoriesPage);
  if (categoriesPage.data.length === 0)
    throw new Error("No active categories available for community creation");
  const categoryId = categoriesPage.data[0].id;

  // Create a valid community name (3-32 chars, starts with a letter, ends alnum)
  const communityName = `c${RandomGenerator.alphaNumeric(10)}`; // starts with letter 'c'

  const community =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      {
        body: {
          name: communityName,
          community_platform_category_id: categoryId,
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);

  // 3) Create a post (as User A)
  const post =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      {
        communityId: community.id,
        body: {
          // Ensure comfortably above minimum length (5–120 characters)
          title: RandomGenerator.paragraph({ sentences: 6 }),
          body: RandomGenerator.content({
            paragraphs: 2,
            sentenceMin: 8,
            sentenceMax: 15,
          }),
          author_display_name: RandomGenerator.name(1),
        } satisfies ICommunityPlatformPost.ICreate,
      },
    );
  typia.assert(post);

  // 4) Create a comment on the post (as User A)
  const comment =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      connection,
      {
        postId: post.id,
        body: {
          content: RandomGenerator.paragraph({ sentences: 6 }), // plain text, >=2 chars
        } satisfies ICommunityPlatformComment.ICreate,
      },
    );
  typia.assert(comment);

  // 5) Join as User B (voter) to set the caller context for DELETE
  const voterAuth = await api.functional.auth.communityMember.join(connection, {
    body: {
      username: `voter_${RandomGenerator.alphaNumeric(8)}`,
      email: typia.random<string & tags.Format<"email">>(),
      password: `P@ssw0rd_${RandomGenerator.alphaNumeric(8)}`,
    } satisfies ICommunityPlatformCommunityMember.ICreate,
  });
  typia.assert(voterAuth);

  // 6) Call erase twice without any prior vote (idempotency expected)
  await api.functional.communityPlatform.communityMember.comments.votes.erase(
    connection,
    { commentId: comment.id },
  );
  await api.functional.communityPlatform.communityMember.comments.votes.erase(
    connection,
    { commentId: comment.id },
  );

  // If we reach here without error, idempotency is validated.
  TestValidator.predicate(
    "deleting a non-existent/none-state vote twice completes without error",
    true,
  );
}
