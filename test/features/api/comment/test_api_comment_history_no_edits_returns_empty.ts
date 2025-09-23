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
 * Newly created comment has empty edit history.
 *
 * Scenario:
 *
 * 1. Join as a community member
 * 2. Fetch categories (active preferred) and pick one
 * 3. Create a community with the chosen category
 * 4. Create a post in that community
 * 5. Create a comment on the post
 * 6. List the comment's history and verify it returns zero items (no edits yet)
 */
export async function test_api_comment_history_no_edits_returns_empty(
  connection: api.IConnection,
) {
  // 1) Authenticate as a community member
  const authorized = await api.functional.auth.communityMember.join(
    connection,
    {
      body: {
        username: RandomGenerator.alphabets(12),
        email: typia.random<string & tags.Format<"email">>(),
        password: RandomGenerator.alphaNumeric(12),
      } satisfies ICommunityPlatformCommunityMember.ICreate,
    },
  );
  typia.assert(authorized);

  // 2) Fetch active categories and pick one; fallback to any category if none
  const pageActive = await api.functional.communityPlatform.categories.index(
    connection,
    {
      body: {
        active: true,
      } satisfies ICommunityPlatformCategory.IRequest,
    },
  );
  typia.assert(pageActive);

  let category = pageActive.data.find((c) => c.active === true);
  if (!category) {
    const pageAny = await api.functional.communityPlatform.categories.index(
      connection,
      { body: {} satisfies ICommunityPlatformCategory.IRequest },
    );
    typia.assert(pageAny);
    category = pageAny.data[0];
  }
  if (!category)
    throw new Error("No category available to create a community.");
  typia.assertGuard(category!);

  // Helper: generate community name matching ^[A-Za-z][A-Za-z0-9_-]{1,30}[A-Za-z0-9]$
  const communityName = (() => {
    const start = RandomGenerator.alphabets(1); // starts with a letter
    const mid = RandomGenerator.alphaNumeric(6); // alphanumeric core
    const end = RandomGenerator.alphaNumeric(1); // ends alphanumeric
    return `${start}${mid}${end}`; // total length 8
  })();

  // 3) Create a community
  const community =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      {
        body: {
          name: communityName,
          community_platform_category_id: category.id,
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);

  // 4) Create a post in the community
  const post =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      {
        communityId: community.id,
        body: {
          title: RandomGenerator.paragraph({ sentences: 6 }),
          body: RandomGenerator.content({
            paragraphs: 1,
            sentenceMin: 10,
            sentenceMax: 20,
            wordMin: 3,
            wordMax: 8,
          }),
          author_display_name: RandomGenerator.name(1),
        } satisfies ICommunityPlatformPost.ICreate,
      },
    );
  typia.assert(post);

  // 5) Create a comment on the post
  const comment =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      connection,
      {
        postId: post.id,
        body: {
          content: RandomGenerator.paragraph({ sentences: 8 }),
        } satisfies ICommunityPlatformComment.ICreate,
      },
    );
  typia.assert(comment);

  // 6) List the comment's history (should be empty because no edits yet)
  const historyPage =
    await api.functional.communityPlatform.comments.history.index(connection, {
      commentId: comment.id,
      body: {} satisfies ICommunityPlatformCommentSnapshot.IRequest,
    });
  typia.assert(historyPage);

  TestValidator.equals(
    "newly created comment has no history snapshots",
    historyPage.data.length,
    0,
  );
}
