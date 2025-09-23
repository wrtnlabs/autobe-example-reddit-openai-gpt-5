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

export async function test_api_comment_update_success_by_author(
  connection: api.IConnection,
) {
  // 1) Authenticate as User A (community member)
  const joinBody = {
    username: `${RandomGenerator.alphabets(6)}_${RandomGenerator.alphabets(4)}`,
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const authA = await api.functional.auth.communityMember.join(connection, {
    body: joinBody,
  });
  typia.assert(authA);

  // 2) Discover an active category (fallback to any if none active)
  const catReqActive = {
    page: 1,
    limit: 20,
    active: true,
    sortBy: "display_order" as IECategorySortBy,
    direction: "asc" as IESortDirection,
  } satisfies ICommunityPlatformCategory.IRequest;
  let categories = await api.functional.communityPlatform.categories.index(
    connection,
    { body: catReqActive },
  );
  typia.assert(categories);

  if (categories.data.length === 0) {
    const catReqAny = {
      page: 1,
      limit: 20,
      sortBy: "display_order" as IECategorySortBy,
      direction: "asc" as IESortDirection,
    } satisfies ICommunityPlatformCategory.IRequest;
    categories = await api.functional.communityPlatform.categories.index(
      connection,
      { body: catReqAny },
    );
    typia.assert(categories);
  }

  const category = categories.data[0];
  if (!category)
    throw new Error("No category available to create a community.");

  // 3) Create a community under the discovered category
  const communityBody = {
    name: `${RandomGenerator.alphabets(3)}-${RandomGenerator.alphabets(5)}`,
    community_platform_category_id: category.id,
    description: RandomGenerator.paragraph({ sentences: 6 }),
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      { body: communityBody },
    );
  typia.assert(community);

  // 4) Create a post in the community
  const postBody = {
    title: RandomGenerator.paragraph({ sentences: 4 }),
    body: RandomGenerator.content({
      paragraphs: 1,
      sentenceMin: 12,
      sentenceMax: 20,
      wordMin: 3,
      wordMax: 7,
    }),
    author_display_name: RandomGenerator.name(1),
  } satisfies ICommunityPlatformPost.ICreate;
  const post =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      { communityId: community.id, body: postBody },
    );
  typia.assert(post);

  // 5) Create a top-level comment on the post (parent_id null)
  const originalCommentBody = {
    content: RandomGenerator.paragraph({ sentences: 16 }),
    parent_id: null,
  } satisfies ICommunityPlatformComment.ICreate;
  const original =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      connection,
      { postId: post.id, body: originalCommentBody },
    );
  typia.assert(original);

  // Snapshot immutable fields and timestamps before update
  const beforeId = original.id;
  const beforePostId = original.community_platform_post_id;
  const beforeParentId = original.parent_id ?? null;
  const beforeUpdatedAtMs = new Date(original.updated_at).getTime();
  const beforeContent = original.content;

  // 6) Update the comment as the original author with valid content
  const updateBody = {
    content: RandomGenerator.paragraph({ sentences: 20 }),
  } satisfies ICommunityPlatformComment.IUpdate;
  const updated =
    await api.functional.communityPlatform.communityMember.comments.update(
      connection,
      { commentId: original.id, body: updateBody },
    );
  typia.assert(updated);

  // Validate immutable fields and updated content
  TestValidator.equals(
    "id should remain unchanged after update",
    updated.id,
    beforeId,
  );
  TestValidator.equals(
    "post relation should remain unchanged after update",
    updated.community_platform_post_id,
    beforePostId,
  );
  TestValidator.equals(
    "parent_id should remain unchanged (normalized to null)",
    updated.parent_id ?? null,
    beforeParentId,
  );
  TestValidator.notEquals(
    "content should be changed after update",
    updated.content,
    beforeContent,
  );
  TestValidator.equals(
    "author should remain original user",
    updated.community_platform_user_id,
    authA.id,
  );
  const afterUpdatedAtMs = new Date(updated.updated_at).getTime();
  TestValidator.predicate(
    "updated_at must increase after update",
    afterUpdatedAtMs > beforeUpdatedAtMs,
  );

  // 7) Optional persistence check via GET
  const reloaded = await api.functional.communityPlatform.comments.at(
    connection,
    { commentId: updated.id },
  );
  typia.assert(reloaded);
  TestValidator.equals(
    "reloaded comment reflects updated content",
    reloaded.content,
    updated.content,
  );
  TestValidator.equals(
    "reloaded id equals updated id",
    reloaded.id,
    updated.id,
  );

  // 8) Negative case: content length 1 should fail (business validation)
  await TestValidator.error(
    "updating with too-short content should fail",
    async () => {
      const invalidBody = {
        content: "a",
      } satisfies ICommunityPlatformComment.IUpdate;
      await api.functional.communityPlatform.communityMember.comments.update(
        connection,
        { commentId: original.id, body: invalidBody },
      );
    },
  );
}
