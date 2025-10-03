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

/**
 * Refresh session and update a comment under the renewed token.
 *
 * Business flow:
 *
 * 1. Author joins to obtain initial session
 * 2. Create community → post → comment
 * 3. Refresh the session (long-lived session behavior)
 * 4. Update the comment content using the refreshed session
 *
 * Validations:
 *
 * - Refresh returns valid authorization with the same member id
 * - Comment content is updated
 * - Immutable fields (id, postId, authorId, parentId) are unchanged
 * - CreatedAt unchanged, updatedAt strictly increased
 */
export async function test_api_comment_update_resume_after_refresh(
  connection: api.IConnection,
) {
  // Helper to build short text within max length
  const shortText = (max: number, words: number): string => {
    const text = ArrayUtil.repeat(words, () => RandomGenerator.name(1)).join(
      " ",
    );
    return text.length <= max ? text : text.slice(0, max);
  };

  // 1) Join as author and obtain session
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    username: RandomGenerator.name(1),
    password: RandomGenerator.alphaNumeric(12),
    displayName: RandomGenerator.name(1),
    client: {
      userAgent: `e2e/${RandomGenerator.alphaNumeric(6)}`,
    },
  } satisfies ICommunityPlatformRegisteredMember.IJoin;
  const author = await api.functional.auth.registeredMember.join(connection, {
    body: joinBody,
  });
  typia.assert(author);

  // 2) Create community
  const communityName: string = `e2e_${RandomGenerator.alphaNumeric(12)}`; // matches pattern & length
  const communityBody = {
    name: communityName,
    category: typia.random<IECommunityCategory>(),
    description: shortText(500, 40),
    rules: [
      { order: 1, text: shortText(100, 10) },
      { order: 2, text: shortText(100, 10) },
    ],
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      { body: communityBody },
    );
  typia.assert(community);

  // 2-2) Create post under the community
  const postBody = {
    communityName: community.name,
    title: shortText(120, 12),
    body: RandomGenerator.content({
      paragraphs: 2,
      sentenceMin: 6,
      sentenceMax: 12,
    }),
    authorDisplayName: RandomGenerator.name(1),
  } satisfies ICommunityPlatformPost.ICreate;
  const post =
    await api.functional.communityPlatform.registeredMember.posts.create(
      connection,
      { body: postBody },
    );
  typia.assert(post);

  // 2-3) Create a comment under the post
  const commentCreateBody = {
    content: shortText(2000, 40),
  } satisfies ICommunityPlatformComment.ICreate;
  const created =
    await api.functional.communityPlatform.registeredMember.posts.comments.create(
      connection,
      { postId: post.id, body: commentCreateBody },
    );
  typia.assert(created);

  // Snapshot immutable & temporal fields before update
  const original = {
    id: created.id,
    postId: created.postId,
    authorId: created.authorId,
    parentId: created.parentId,
    createdAt: created.createdAt,
    updatedAt: created.updatedAt,
    content: created.content,
  };

  // 3) Refresh the session before update
  const refreshBody = {} satisfies ICommunityPlatformRegisteredMember.IRefresh;
  const refreshed = await api.functional.auth.registeredMember.refresh(
    connection,
    {
      body: refreshBody,
    },
  );
  typia.assert(refreshed);
  TestValidator.equals(
    "refresh preserves the same member id",
    refreshed.id,
    author.id,
  );

  // 4) Update the comment with new content
  const updateBody = {
    content: shortText(2000, 50),
  } satisfies ICommunityPlatformComment.IUpdate;
  const updated =
    await api.functional.communityPlatform.registeredMember.posts.comments.update(
      connection,
      { postId: post.id, commentId: created.id, body: updateBody },
    );
  typia.assert(updated);

  // 5) Business validations
  // content changed
  TestValidator.notEquals(
    "comment content updated",
    updated.content,
    original.content,
  );
  // immutable fields unchanged
  TestValidator.equals("id unchanged", updated.id, original.id);
  TestValidator.equals("postId unchanged", updated.postId, original.postId);
  TestValidator.equals(
    "authorId unchanged",
    updated.authorId,
    original.authorId,
  );
  TestValidator.equals(
    "parentId unchanged",
    updated.parentId ?? null,
    original.parentId ?? null,
  );
  // createdAt unchanged
  TestValidator.equals(
    "createdAt unchanged",
    updated.createdAt,
    original.createdAt,
  );
  // updatedAt strictly increased
  TestValidator.predicate(
    "updatedAt increased",
    new Date(updated.updatedAt).getTime() >
      new Date(original.updatedAt).getTime(),
  );
}
