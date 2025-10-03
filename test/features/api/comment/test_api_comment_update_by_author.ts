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

export async function test_api_comment_update_by_author(
  connection: api.IConnection,
) {
  /**
   * Validate that a comment author can update their own comment within a post.
   *
   * Steps:
   *
   * 1. Join as a registered member (author).
   * 2. Create a community to host a post.
   * 3. Create a post under that community.
   * 4. Create a root comment authored by the same user.
   * 5. Update the comment content via PUT endpoint.
   * 6. Validate content updated, timestamps, and immutable associations.
   */

  // 1) Join as registered member (author)
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const username: string = RandomGenerator.name(1);
  const password: string = RandomGenerator.alphaNumeric(12);

  const authorized = await api.functional.auth.registeredMember.join(
    connection,
    {
      body: {
        email,
        username,
        password,
        displayName: RandomGenerator.name(1),
        client: {
          userAgent: `e2e/${RandomGenerator.alphaNumeric(6)}`,
          clientPlatform: "node-test",
          sessionType: "standard",
        },
      } satisfies ICommunityPlatformRegisteredMember.IJoin,
    },
  );
  typia.assert(authorized);

  // 2) Create a community
  const communityName: string = `c-${RandomGenerator.alphaNumeric(12)}`; // safe pattern
  const community =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      {
        body: {
          name: communityName,
          category: "Tech & Programming", // valid enum value
          description: RandomGenerator.paragraph({ sentences: 8 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);

  // 3) Create a post
  const post =
    await api.functional.communityPlatform.registeredMember.posts.create(
      connection,
      {
        body: {
          communityName: community.name,
          title: RandomGenerator.paragraph({ sentences: 5 }),
          body: RandomGenerator.content({
            paragraphs: 2,
            sentenceMin: 10,
            sentenceMax: 20,
            wordMin: 3,
            wordMax: 10,
          }),
          authorDisplayName: RandomGenerator.name(1),
        } satisfies ICommunityPlatformPost.ICreate,
      },
    );
  typia.assert(post);

  // 4) Create a comment (root)
  const initialContent: string = RandomGenerator.paragraph({ sentences: 6 });
  const comment =
    await api.functional.communityPlatform.registeredMember.posts.comments.create(
      connection,
      {
        postId: post.id,
        body: {
          content: initialContent,
        } satisfies ICommunityPlatformComment.ICreate,
      },
    );
  typia.assert(comment);

  // Keep previous immutable/timestamp references
  const prevAuthorId = comment.authorId;
  const prevParentId = comment.parentId ?? null;
  const prevCreatedAt = comment.createdAt;
  const prevUpdatedAt = comment.updatedAt;

  // 5) Update the comment content
  const newContent: string = `Updated: ${RandomGenerator.paragraph({ sentences: 8 })}`;
  const updated =
    await api.functional.communityPlatform.registeredMember.posts.comments.update(
      connection,
      {
        postId: post.id,
        commentId: comment.id,
        body: {
          content: newContent,
        } satisfies ICommunityPlatformComment.IUpdate,
      },
    );
  typia.assert(updated);

  // 6) Validations
  // Content changed
  TestValidator.notEquals(
    "content should be changed after update",
    updated.content,
    initialContent,
  );
  TestValidator.equals(
    "content equals new value provided",
    updated.content,
    newContent,
  );

  // Immutable associations
  TestValidator.equals("postId remains unchanged", updated.postId, post.id);
  TestValidator.equals(
    "authorId remains unchanged",
    updated.authorId,
    prevAuthorId,
  );
  TestValidator.equals(
    "parentId remains unchanged",
    updated.parentId,
    prevParentId,
  );

  // Timestamps: createdAt unchanged; updatedAt increased and not before createdAt
  TestValidator.equals(
    "createdAt remains unchanged",
    updated.createdAt,
    prevCreatedAt,
  );

  const prevUpdatedAtTs = new Date(prevUpdatedAt).getTime();
  const updatedAtTs = new Date(updated.updatedAt).getTime();
  const createdAtTs = new Date(updated.createdAt).getTime();

  TestValidator.predicate(
    "updatedAt is greater than previous updatedAt",
    updatedAtTs > prevUpdatedAtTs,
  );
  TestValidator.predicate(
    "updatedAt is not earlier than createdAt",
    updatedAtTs >= createdAtTs,
  );
}
