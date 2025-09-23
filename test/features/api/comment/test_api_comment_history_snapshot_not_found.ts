import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCategory";
import type { ICommunityPlatformComment } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformComment";
import type { ICommunityPlatformCommentSnapshot } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommentSnapshot";
import type { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformPost } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformPost";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";
import type { IECategorySortBy } from "@ORGANIZATION/PROJECT-api/lib/structures/IECategorySortBy";
import type { IESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IESortDirection";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformCategory";

/**
 * Verify that requesting a non-existent comment history snapshot results in an
 * error.
 *
 * Business context:
 *
 * - The history endpoint fetches a specific snapshot (by historyId) for a given
 *   comment (commentId).
 * - To call it meaningfully, we need an authenticated member, a community, a
 *   post, and a comment.
 * - We optionally update the comment once to exercise snapshot generation
 *   policies (not strictly required).
 *
 * Important feasibility note:
 *
 * - The SDK enforces `historyId` to be a UUID at compile time, so we cannot test
 *   invalid UUID formats.
 * - Therefore, this test only verifies the error when querying with a
 *   valid-but-nonexistent historyId.
 *
 * Steps:
 *
 * 1. Join as community member
 * 2. List categories (active) and pick one
 * 3. Create a community under the chosen category
 * 4. Create a post in that community
 * 5. Create a comment under the post
 * 6. Optionally update the comment to ensure snapshotting behavior exists in
 *    system
 * 7. Attempt to fetch a snapshot with a random (non-existent) historyId
 */
export async function test_api_comment_history_snapshot_not_found(
  connection: api.IConnection,
) {
  // Helper: generate a valid community name (3-32 chars, start letter, end alphanumeric)
  const generateCommunityName = (): string => {
    const total = 10; // safe mid-length
    const first = RandomGenerator.alphabets(1); // letter
    const middle = RandomGenerator.alphaNumeric(total - 2); // letters/digits
    const last = RandomGenerator.alphaNumeric(1); // alphanumeric
    return `${first}${middle}${last}`;
  };

  // 1) Join as community member
  const joinBody = {
    username: `user_${RandomGenerator.alphaNumeric(8)}`,
    email: typia.random<string & tags.Format<"email">>(),
    password: `Pw_${RandomGenerator.alphaNumeric(10)}`,
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const authorized = await api.functional.auth.communityMember.join(
    connection,
    {
      body: joinBody,
    },
  );
  typia.assert(authorized);

  // 2) List categories (active)
  const categoriesPage =
    await api.functional.communityPlatform.categories.index(connection, {
      body: {
        page: 1,
        limit: 20,
        active: true,
        sortBy: "display_order",
        direction: "asc",
      } satisfies ICommunityPlatformCategory.IRequest,
    });
  typia.assert(categoriesPage);
  TestValidator.predicate(
    "at least one active category must exist to create a community",
    categoriesPage.data.length > 0,
  );
  const categoryId = categoriesPage.data[0].id; // uuid

  // 3) Create a community
  const communityBody = {
    name: generateCommunityName(),
    community_platform_category_id: categoryId,
    description: RandomGenerator.paragraph({
      sentences: 8,
      wordMin: 3,
      wordMax: 8,
    }),
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      { body: communityBody },
    );
  typia.assert(community);

  // 4) Create a post in the community
  const postBody = {
    title: RandomGenerator.paragraph({ sentences: 3, wordMin: 3, wordMax: 8 }),
    body: RandomGenerator.content({
      paragraphs: 1,
      sentenceMin: 10,
      sentenceMax: 20,
      wordMin: 3,
      wordMax: 8,
    }),
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

  // 5) Create a comment under the post
  const commentBody = {
    content: RandomGenerator.paragraph({
      sentences: 6,
      wordMin: 3,
      wordMax: 8,
    }),
  } satisfies ICommunityPlatformComment.ICreate;
  const comment =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      connection,
      {
        postId: post.id,
        body: commentBody,
      },
    );
  typia.assert(comment);

  // 6) Optional: update the comment once (exercise snapshot policy, though not required)
  const updateBody = {
    content: RandomGenerator.paragraph({
      sentences: 7,
      wordMin: 3,
      wordMax: 8,
    }),
  } satisfies ICommunityPlatformComment.IUpdate;
  const updated =
    await api.functional.communityPlatform.communityMember.comments.update(
      connection,
      {
        commentId: comment.id,
        body: updateBody,
      },
    );
  typia.assert(updated);

  // 7) Attempt to fetch a snapshot using a non-existent historyId
  // Note: Invalid UUID format is not testable due to SDK type guarantees.
  const randomHistoryId = typia.random<string & tags.Format<"uuid">>();
  await TestValidator.error(
    "non-existent snapshot id should result in error",
    async () => {
      await api.functional.communityPlatform.comments.history.at(connection, {
        commentId: comment.id,
        historyId: randomHistoryId,
      });
    },
  );
}
