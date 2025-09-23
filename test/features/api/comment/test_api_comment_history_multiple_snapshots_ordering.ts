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

export async function test_api_comment_history_multiple_snapshots_ordering(
  connection: api.IConnection,
) {
  // 1) Authenticate a community member
  const username = `user_${RandomGenerator.alphaNumeric(8)}`;
  const email = typia.random<string & tags.Format<"email">>();
  const password = `P${RandomGenerator.alphaNumeric(12)}`; // >= 8 chars
  const authorized = await api.functional.auth.communityMember.join(
    connection,
    {
      body: {
        username,
        email,
        password,
      } satisfies ICommunityPlatformCommunityMember.ICreate,
    },
  );
  typia.assert(authorized);

  // 2) Find an active category
  const categoriesPage =
    await api.functional.communityPlatform.categories.index(connection, {
      body: {
        active: true,
        limit: 50 as number,
        sortBy: "display_order",
        direction: "asc",
      } satisfies ICommunityPlatformCategory.IRequest,
    });
  typia.assert(categoriesPage);

  TestValidator.predicate(
    "category seed exists (at least one active category)",
    categoriesPage.data.length > 0,
  );
  if (categoriesPage.data.length === 0)
    throw new Error("No active categories found for community creation");
  const categoryId = categoriesPage.data[0].id;

  // 3) Create a community
  const community =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      {
        body: {
          name: `c${RandomGenerator.alphaNumeric(9)}` as string, // start with letter, alnum end
          community_platform_category_id: categoryId,
          description: RandomGenerator.paragraph({ sentences: 6 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);

  // 4) Create a post within the community
  const post =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      {
        communityId: community.id,
        body: {
          title: RandomGenerator.name(3) as string, // 3 words → ~>= 5 chars total
          body: RandomGenerator.content({
            paragraphs: 2,
            sentenceMin: 10,
            sentenceMax: 15,
            wordMin: 3,
            wordMax: 8,
          }),
        } satisfies ICommunityPlatformPost.ICreate,
      },
    );
  typia.assert(post);

  // 5) Create an initial comment
  const originalComment =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      connection,
      {
        postId: post.id,
        body: {
          content: RandomGenerator.paragraph({ sentences: 12 }),
        } satisfies ICommunityPlatformComment.ICreate,
      },
    );
  typia.assert(originalComment);

  // 6) Edit the comment twice to generate multiple snapshots
  const updatedOnce =
    await api.functional.communityPlatform.communityMember.comments.update(
      connection,
      {
        commentId: originalComment.id,
        body: {
          content: RandomGenerator.paragraph({ sentences: 8 }),
        } satisfies ICommunityPlatformComment.IUpdate,
      },
    );
  typia.assert(updatedOnce);
  TestValidator.equals(
    "first update preserves comment id",
    updatedOnce.id,
    originalComment.id,
  );

  const updatedTwice =
    await api.functional.communityPlatform.communityMember.comments.update(
      connection,
      {
        commentId: originalComment.id,
        body: {
          content: RandomGenerator.paragraph({ sentences: 10 }),
        } satisfies ICommunityPlatformComment.IUpdate,
      },
    );
  typia.assert(updatedTwice);
  TestValidator.equals(
    "second update preserves comment id",
    updatedTwice.id,
    originalComment.id,
  );

  // 7) List history snapshots and validate ordering and pagination
  const history = await api.functional.communityPlatform.comments.history.index(
    connection,
    {
      commentId: originalComment.id,
      body: {
        page: 1 as number,
        limit: 10 as number,
        orderBy: "created_at",
        direction: "desc",
      } satisfies ICommunityPlatformCommentSnapshot.IRequest,
    },
  );
  typia.assert(history);

  // At least two snapshots exist after two edits
  TestValidator.predicate(
    "history has at least two snapshots after two edits",
    history.data.length >= 2,
  );

  // All snapshots belong to the same comment
  TestValidator.predicate(
    "all snapshots reference the target comment",
    history.data.every(
      (s) => s.community_platform_comment_id === originalComment.id,
    ),
  );

  // Verify newest-first ordering by created_at (non-increasing)
  TestValidator.predicate(
    "snapshots ordered newest-first by created_at",
    history.data.every(
      (s, i, arr) =>
        i === 0 ||
        new Date(arr[i - 1].created_at).getTime() >=
          new Date(s.created_at).getTime(),
    ),
  );

  // Pagination consistency: first two items via page=1/2 with limit=1
  const page1 = await api.functional.communityPlatform.comments.history.index(
    connection,
    {
      commentId: originalComment.id,
      body: {
        page: 1 as number,
        limit: 1 as number,
        orderBy: "created_at",
        direction: "desc",
      } satisfies ICommunityPlatformCommentSnapshot.IRequest,
    },
  );
  typia.assert(page1);
  TestValidator.predicate(
    "page1 returns exactly one item",
    page1.data.length === 1,
  );
  TestValidator.equals(
    "first page item matches baseline first snapshot",
    page1.data[0]?.id,
    history.data[0]?.id,
  );

  const page2 = await api.functional.communityPlatform.comments.history.index(
    connection,
    {
      commentId: originalComment.id,
      body: {
        page: 2 as number,
        limit: 1 as number,
        orderBy: "created_at",
        direction: "desc",
      } satisfies ICommunityPlatformCommentSnapshot.IRequest,
    },
  );
  typia.assert(page2);
  TestValidator.predicate(
    "page2 returns exactly one item",
    page2.data.length === 1,
  );
  TestValidator.equals(
    "second page item matches baseline second snapshot",
    page2.data[0]?.id,
    history.data[1]?.id,
  );
}
