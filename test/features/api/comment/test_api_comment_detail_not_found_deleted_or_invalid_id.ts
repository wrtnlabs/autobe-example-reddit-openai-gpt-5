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

export async function test_api_comment_detail_not_found_deleted_or_invalid_id(
  connection: api.IConnection,
) {
  // Helper: generate a valid community name that satisfies pattern and length
  const generateCommunityName = (): string => {
    const core = RandomGenerator.alphaNumeric(10); // alphanumeric middle
    return `c${core}`; // starts with a letter, ends alphanumeric, length >= 3
  };

  // 1) Join as a community member (authentication setup)
  const joinBody = {
    username: `user_${RandomGenerator.alphaNumeric(8)}`,
    email: typia.random<string & tags.Format<"email">>(),
    password: `P@ss${RandomGenerator.alphaNumeric(6)}0`, // length >= 8
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const me = await api.functional.auth.communityMember.join(connection, {
    body: joinBody,
  });
  typia.assert(me);

  // 2) Discover a category
  const categoriesPage =
    await api.functional.communityPlatform.categories.index(connection, {
      body: {
        active: true,
        limit: 50 satisfies number as number,
      } satisfies ICommunityPlatformCategory.IRequest,
    });
  typia.assert(categoriesPage);
  const candidateCategoryId = categoriesPage.data[0]?.id;
  const categoryId: string & tags.Format<"uuid"> = typia.assert<
    string & tags.Format<"uuid">
  >(candidateCategoryId ?? typia.random<string & tags.Format<"uuid">>());

  // 3) Create a community
  const communityBody = {
    name: generateCommunityName(),
    community_platform_category_id: categoryId,
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
    title: RandomGenerator.paragraph({ sentences: 6 }), // 6 words
    body: RandomGenerator.content({
      paragraphs: 2,
      sentenceMin: 8,
      sentenceMax: 16,
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
    content: RandomGenerator.paragraph({ sentences: 12 }),
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

  // A) Positive control: comment is retrievable before deletion
  const read = await api.functional.communityPlatform.comments.at(connection, {
    commentId: comment.id,
  });
  typia.assert(read);
  TestValidator.equals(
    "retrieved comment id matches created",
    read.id,
    comment.id,
  );

  // Soft-delete the comment
  await api.functional.communityPlatform.communityMember.comments.erase(
    connection,
    { commentId: comment.id },
  );

  // B) Deleted comment should error when fetching
  await TestValidator.error(
    "deleted comment detail should throw error",
    async () => {
      await api.functional.communityPlatform.comments.at(connection, {
        commentId: comment.id,
      });
    },
  );

  // C) Non-existent UUID should also error (business logic not-found; status not asserted)
  const nonExistentId = typia.random<string & tags.Format<"uuid">>();
  await TestValidator.error(
    "non-existent comment id should throw error",
    async () => {
      await api.functional.communityPlatform.comments.at(connection, {
        commentId: nonExistentId,
      });
    },
  );
}
