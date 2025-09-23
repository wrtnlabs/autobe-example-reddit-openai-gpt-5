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

export async function test_api_comment_history_snapshot_retrieval_success(
  connection: api.IConnection,
) {
  /**
   * Retrieve a specific historical snapshot for a comment and verify its
   * integrity.
   *
   * Steps:
   *
   * 1. Join as a community member (auth handled by SDK)
   * 2. List categories (prefer active; fallback to any) and pick one
   * 3. Create a community using the chosen category
   * 4. Create a post in the community
   * 5. Create an initial comment
   * 6. Update the comment to generate a snapshot (fallback: update again if
   *    needed)
   * 7. List snapshots and select one historyId
   * 8. Get the snapshot by {commentId, historyId} and validate
   *    relations/consistency
   */

  // Helper to generate a compliant community name (3–32 chars; we use 3–16)
  const randomCommunityName = (): string => {
    const letters = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"];
    const mid = [
      ..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_",
    ];
    const tail = [
      ..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
    ];
    const len = typia.random<
      number & tags.Type<"uint32"> & tags.Minimum<3> & tags.Maximum<16>
    >();
    const first = RandomGenerator.pick(letters);
    const last = RandomGenerator.pick(tail);
    const middleCount = Math.max(0, len - 2);
    let middle = "";
    for (let i = 0; i < middleCount; i++) middle += RandomGenerator.pick(mid);
    return `${first}${middle}${last}`;
  };

  // 1) Authenticate as community member
  const auth = await api.functional.auth.communityMember.join(connection, {
    body: {
      username: `user_${RandomGenerator.alphaNumeric(8)}`,
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ICommunityPlatformCommunityMember.ICreate,
  });
  typia.assert(auth);

  // 2) Discover an active category, fallback to any category when none
  let categories = await api.functional.communityPlatform.categories.index(
    connection,
    {
      body: {
        active: true,
      } satisfies ICommunityPlatformCategory.IRequest,
    },
  );
  typia.assert(categories);

  if (categories.data.length === 0) {
    categories = await api.functional.communityPlatform.categories.index(
      connection,
      {
        body: {
          active: null, // explicit null as intended fallback
        } satisfies ICommunityPlatformCategory.IRequest,
      },
    );
    typia.assert(categories);
  }

  TestValidator.predicate(
    "category list should not be empty",
    categories.data.length > 0,
  );
  const chosenCategory = RandomGenerator.pick(categories.data);

  // 3) Create a community
  const community =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      {
        body: {
          name: randomCommunityName(),
          community_platform_category_id: chosenCategory.id,
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);
  TestValidator.equals(
    "community's category should match chosen category",
    community.community_platform_category_id,
    chosenCategory.id,
  );

  // 4) Create a post under the community
  const post =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      {
        communityId: community.id,
        body: {
          title: RandomGenerator.paragraph({ sentences: 3 }),
          body: RandomGenerator.content({ paragraphs: 2 }),
        } satisfies ICommunityPlatformPost.ICreate,
      },
    );
  typia.assert(post);
  TestValidator.equals(
    "post belongs to the created community",
    post.community_platform_community_id,
    community.id,
  );

  // 5) Create an initial comment
  const originalContent = RandomGenerator.paragraph({ sentences: 12 });
  const comment =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      connection,
      {
        postId: post.id,
        body: {
          content: originalContent,
        } satisfies ICommunityPlatformComment.ICreate,
      },
    );
  typia.assert(comment);
  TestValidator.equals(
    "comment belongs to the created post",
    comment.community_platform_post_id,
    post.id,
  );

  // 6) Update the comment to generate a snapshot
  const updatedContent = RandomGenerator.paragraph({ sentences: 10 });
  const updatedComment =
    await api.functional.communityPlatform.communityMember.comments.update(
      connection,
      {
        commentId: comment.id,
        body: {
          content: updatedContent,
        } satisfies ICommunityPlatformComment.IUpdate,
      },
    );
  typia.assert(updatedComment);
  TestValidator.equals(
    "updated comment id should equal the original",
    updatedComment.id,
    comment.id,
  );

  // 7) List snapshots. If none, update once more and list again.
  let historyPage =
    await api.functional.communityPlatform.comments.history.index(connection, {
      commentId: comment.id,
      body: {
        orderBy: "created_at",
        direction: "desc",
      } satisfies ICommunityPlatformCommentSnapshot.IRequest,
    });
  typia.assert(historyPage);

  if (historyPage.data.length === 0) {
    const secondContent = RandomGenerator.paragraph({ sentences: 8 });
    const secondUpdate =
      await api.functional.communityPlatform.communityMember.comments.update(
        connection,
        {
          commentId: comment.id,
          body: {
            content: secondContent,
          } satisfies ICommunityPlatformComment.IUpdate,
        },
      );
    typia.assert(secondUpdate);

    historyPage = await api.functional.communityPlatform.comments.history.index(
      connection,
      {
        commentId: comment.id,
        body: {
          orderBy: "created_at",
          direction: "desc",
        } satisfies ICommunityPlatformCommentSnapshot.IRequest,
      },
    );
    typia.assert(historyPage);
  }

  TestValidator.predicate(
    "snapshot history should not be empty after comment updates",
    historyPage.data.length > 0,
  );
  const snapshotFromList = historyPage.data[0];

  // 8) Get the snapshot by {commentId, historyId}
  const detailed = await api.functional.communityPlatform.comments.history.at(
    connection,
    {
      commentId: comment.id,
      historyId: snapshotFromList.id,
    },
  );
  typia.assert(detailed);

  // Relationship and consistency checks
  TestValidator.equals(
    "snapshot belongs to the specified comment",
    detailed.community_platform_comment_id,
    comment.id,
  );
  TestValidator.equals(
    "detailed snapshot equals the list item",
    detailed,
    snapshotFromList,
  );
  TestValidator.predicate(
    "snapshot content should be one of known states (original/updated)",
    detailed.content === originalContent || detailed.content === updatedContent,
  );
}
