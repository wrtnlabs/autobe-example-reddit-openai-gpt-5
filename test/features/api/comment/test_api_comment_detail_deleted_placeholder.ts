import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IClientContext } from "@ORGANIZATION/PROJECT-api/lib/structures/IClientContext";
import type { ICommunityPlatformComment } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformComment";
import type { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";
import type { ICommunityPlatformCommunityRule } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityRule";
import type { ICommunityPlatformCommunityRuleArray } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityRuleArray";
import type { ICommunityPlatformPost } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformPost";
import type { ICommunityPlatformRegisteredMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRegisteredMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";
import type { IECommunityCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityCategory";
import type { IECommunityPlatformCommunityCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformCommunityCategory";
import type { IECommunityPlatformVoteState } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformVoteState";

export async function test_api_comment_detail_deleted_placeholder(
  connection: api.IConnection,
) {
  /** 1. Join as registered member (author) to obtain authenticated context. */
  const authorized = await api.functional.auth.registeredMember.join(
    connection,
    {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        username: `u${RandomGenerator.alphaNumeric(10)}`,
        password: RandomGenerator.alphaNumeric(12),
        displayName: RandomGenerator.name(1),
      } satisfies ICommunityPlatformRegisteredMember.IJoin,
    },
  );
  typia.assert(authorized);

  /**
   * 2. Create a community with a valid name and allowed category.
   *
   *    - Name format: start/end alphanumeric, 3–30, only [A-Za-z0-9_-] as interior.
   */
  const communityName = `c${RandomGenerator.alphaNumeric(8)}_${RandomGenerator.alphaNumeric(4)}`; // guaranteed start/end alnum
  const community =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      {
        body: {
          name: communityName,
          category: typia.random<IECommunityCategory>(),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);

  /** 3. Create a post within the community. */
  const post =
    await api.functional.communityPlatform.registeredMember.posts.create(
      connection,
      {
        body: {
          communityName: community.name,
          title: RandomGenerator.paragraph({ sentences: 6 }),
          body: RandomGenerator.content({
            paragraphs: 1,
            sentenceMin: 10,
            sentenceMax: 20,
            wordMin: 3,
            wordMax: 8,
          }),
          authorDisplayName: RandomGenerator.name(1),
        } satisfies ICommunityPlatformPost.ICreate,
      },
    );
  typia.assert(post);

  /** 4. Create a comment under the post. */
  const comment =
    await api.functional.communityPlatform.registeredMember.posts.comments.create(
      connection,
      {
        postId: post.id,
        body: {
          content: RandomGenerator.paragraph({ sentences: 8 }),
        } satisfies ICommunityPlatformComment.ICreate,
      },
    );
  typia.assert(comment);

  // Validate created comment belongs to the created post
  TestValidator.equals(
    "created comment belongs to the created post",
    comment.postId,
    post.id,
  );

  /** 5. Soft-delete the comment via registered member endpoint. */
  await api.functional.communityPlatform.registeredMember.comments.erase(
    connection,
    {
      commentId: comment.id,
    },
  );

  /** 6. Publicly read the comment after deletion, expect deletedAt present. */
  const read = await api.functional.communityPlatform.comments.at(connection, {
    commentId: comment.id,
  });
  typia.assert(read);

  // Identifier consistency
  TestValidator.equals(
    "read comment id matches created id",
    read.id,
    comment.id,
  );
  TestValidator.equals(
    "read comment postId matches created post id",
    read.postId,
    post.id,
  );

  // deletedAt should be present (non-null and non-undefined) after soft-delete
  TestValidator.predicate(
    "deletedAt should be set after soft deletion",
    read.deletedAt !== null && read.deletedAt !== undefined,
  );

  // Extra safety: assert deletedAt string format when present
  if (read.deletedAt !== null && read.deletedAt !== undefined) {
    const deletedAt = typia.assert<string & tags.Format<"date-time">>(
      read.deletedAt!,
    );
    void deletedAt; // no-op: validated above
  }
}
