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
import type { IECommentSnapshotOrderBy } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommentSnapshotOrderBy";
import type { IEOrderDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IEOrderDirection";
import type { IESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IESortDirection";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformCategory";
import type { IPageICommunityPlatformCommentSnapshot } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformCommentSnapshot";

/**
 * Validate that fetching a comment snapshot with a mismatched parent fails.
 *
 * Context:
 *
 * - A snapshot belongs to exactly one comment. Fetching a snapshot through a
 *   different commentId must fail without leaking details.
 *
 * Steps:
 *
 * 1. Authenticate a community member.
 * 2. Discover an active category and pick one.
 * 3. Create a community under the chosen category.
 * 4. Create a post in that community.
 * 5. Create Comment A, then update it to generate a snapshot. List its history and
 *    capture historyId_A.
 * 6. Create Comment B, then update it to generate a snapshot. List its history and
 *    capture historyId_B.
 * 7. Positive control: GET history.at(commentId_A, historyId_A) succeeds.
 * 8. Negative: GET history.at(commentId_A, historyId_B) throws an error
 *    (mismatched pair). Optionally also test the symmetric mismatch.
 */
export async function test_api_comment_history_snapshot_wrong_parent_not_found(
  connection: api.IConnection,
) {
  // 1) Authenticate as community member
  const auth = await api.functional.auth.communityMember.join(connection, {
    body: {
      username: `user_${RandomGenerator.alphaNumeric(8)}`,
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ICommunityPlatformCommunityMember.ICreate,
  });
  typia.assert(auth);

  // 2) Find an active category
  const categories = await api.functional.communityPlatform.categories.index(
    connection,
    {
      body: {
        page: 1,
        limit: 20,
        active: true,
        sortBy: "display_order",
        direction: "asc",
      } satisfies ICommunityPlatformCategory.IRequest,
    },
  );
  typia.assert(categories);
  TestValidator.predicate(
    "at least one active category must exist",
    categories.data.length > 0,
  );
  const categoryId = categories.data[0].id;

  // 3) Create a community
  const community =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      {
        body: {
          name: `c${RandomGenerator.alphaNumeric(12)}`,
          community_platform_category_id: categoryId,
          description: RandomGenerator.paragraph({ sentences: 8 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);

  // 4) Create a post under the community
  const post =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      {
        communityId: community.id,
        body: {
          title: RandomGenerator.paragraph({ sentences: 4 }),
          body: RandomGenerator.content({
            paragraphs: 1,
            sentenceMin: 12,
            sentenceMax: 20,
            wordMin: 3,
            wordMax: 8,
          }),
        } satisfies ICommunityPlatformPost.ICreate,
      },
    );
  typia.assert(post);

  // 5) Comment A: create and update to generate snapshot
  const commentA =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      connection,
      {
        postId: post.id,
        body: {
          content: RandomGenerator.paragraph({ sentences: 10 }),
        } satisfies ICommunityPlatformComment.ICreate,
      },
    );
  typia.assert(commentA);

  const updatedA =
    await api.functional.communityPlatform.communityMember.comments.update(
      connection,
      {
        commentId: commentA.id,
        body: {
          content: RandomGenerator.paragraph({ sentences: 12 }),
        } satisfies ICommunityPlatformComment.IUpdate,
      },
    );
  typia.assert(updatedA);

  const historyPageA =
    await api.functional.communityPlatform.comments.history.index(connection, {
      commentId: commentA.id,
      body: {
        page: 1,
        limit: 20,
        orderBy: "created_at",
        direction: "desc",
      } satisfies ICommunityPlatformCommentSnapshot.IRequest,
    });
  typia.assert(historyPageA);
  TestValidator.predicate(
    "comment A history should have at least one snapshot",
    historyPageA.data.length > 0,
  );
  const historyIdA = historyPageA.data[0].id;

  // 6) Comment B: create and update to generate its own snapshot
  const commentB =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      connection,
      {
        postId: post.id,
        body: {
          content: RandomGenerator.paragraph({ sentences: 9 }),
        } satisfies ICommunityPlatformComment.ICreate,
      },
    );
  typia.assert(commentB);

  const updatedB =
    await api.functional.communityPlatform.communityMember.comments.update(
      connection,
      {
        commentId: commentB.id,
        body: {
          content: RandomGenerator.paragraph({ sentences: 11 }),
        } satisfies ICommunityPlatformComment.IUpdate,
      },
    );
  typia.assert(updatedB);

  const historyPageB =
    await api.functional.communityPlatform.comments.history.index(connection, {
      commentId: commentB.id,
      body: {
        page: 1,
        limit: 20,
        orderBy: "created_at",
        direction: "desc",
      } satisfies ICommunityPlatformCommentSnapshot.IRequest,
    });
  typia.assert(historyPageB);
  TestValidator.predicate(
    "comment B history should have at least one snapshot",
    historyPageB.data.length > 0,
  );
  const historyIdB = historyPageB.data[0].id;

  // 7) Positive control: valid pair works
  const snapshotA = await api.functional.communityPlatform.comments.history.at(
    connection,
    {
      commentId: commentA.id,
      historyId: historyIdA,
    },
  );
  typia.assert(snapshotA);

  // 8) Negative: mismatched pair must fail (do not assert status code)
  await TestValidator.error(
    "mismatched snapshot access must error: comment A with history of B",
    async () => {
      await api.functional.communityPlatform.comments.history.at(connection, {
        commentId: commentA.id,
        historyId: historyIdB,
      });
    },
  );

  // Optional symmetric mismatch
  await TestValidator.error(
    "mismatched snapshot access must error: comment B with history of A",
    async () => {
      await api.functional.communityPlatform.comments.history.at(connection, {
        commentId: commentB.id,
        historyId: historyIdA,
      });
    },
  );
}
