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
 * Guest guard then resume for comment creation under a post.
 *
 * This test verifies that an unauthenticated user (guest) cannot create a
 * comment, receives an error, and after authenticating (joining), retrying the
 * same request succeeds. It also validates that the created comment is linked
 * to the correct post and author.
 *
 * Steps:
 *
 * 1. Join as User A to obtain authentication and create content.
 * 2. Create a community (owned by User A).
 * 3. Create a post within that community.
 * 4. Prepare an unauthenticated connection and attempt to create a comment (expect
 *    error via guest guard).
 * 5. Join as User B and immediately retry the same comment request.
 * 6. Validate the created comment fields (postId, authorId, content echo).
 */
export async function test_api_comment_creation_guest_guard_then_resume(
  connection: api.IConnection,
) {
  // 1) Join as User A (creator of community/post)
  const joinABody = {
    email: typia.random<string & tags.Format<"email">>(),
    username: RandomGenerator.name(1),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformRegisteredMember.IJoin;
  const userA = await api.functional.auth.registeredMember.join(connection, {
    body: joinABody,
  });
  typia.assert(userA);

  // 2) Create a community
  const communityName: string = `c-${RandomGenerator.alphaNumeric(10)}`; // valid: starts with alpha, ends with alnum
  const communityBody = {
    name: communityName,
    category: typia.random<IECommunityCategory>(),
    description: RandomGenerator.paragraph({ sentences: 8 }),
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      { body: communityBody },
    );
  typia.assert(community);

  // 3) Create a post in the community
  const postBody = {
    communityName: communityName,
    title: RandomGenerator.paragraph({ sentences: 6 }),
    body: RandomGenerator.content({
      paragraphs: 1,
      sentenceMin: 12,
      sentenceMax: 18,
    }),
  } satisfies ICommunityPlatformPost.ICreate;
  const post =
    await api.functional.communityPlatform.registeredMember.posts.create(
      connection,
      { body: postBody },
    );
  typia.assert(post);

  // Prepare comment body to reuse for guest attempt and resumed attempt
  const commentBody = {
    content: RandomGenerator.paragraph({ sentences: 8 }),
  } satisfies ICommunityPlatformComment.ICreate;

  // 4) Guest guard: attempt to create comment without authentication
  const guestConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "guest must not be able to create a comment (guest guard)",
    async () => {
      await api.functional.communityPlatform.registeredMember.posts.comments.create(
        guestConn,
        { postId: post.id, body: commentBody },
      );
    },
  );

  // 5) Join as User B (who will successfully create the comment)
  const joinBBody = {
    email: typia.random<string & tags.Format<"email">>(),
    username: RandomGenerator.name(1),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformRegisteredMember.IJoin;
  const userB = await api.functional.auth.registeredMember.join(connection, {
    body: joinBBody,
  });
  typia.assert(userB);

  // 6) Retry the same comment creation request as authenticated User B
  const comment =
    await api.functional.communityPlatform.registeredMember.posts.comments.create(
      connection,
      { postId: post.id, body: commentBody },
    );
  typia.assert(comment);

  // Business validations
  TestValidator.equals(
    "created comment belongs to the target post",
    comment.postId,
    post.id,
  );
  TestValidator.equals(
    "created comment is authored by the newly joined user",
    comment.authorId,
    userB.id,
  );
  TestValidator.equals(
    "created comment content echoes the request",
    comment.content,
    commentBody.content,
  );

  // Optional: if author summary is present, its id should match too
  if (comment.author !== undefined) {
    TestValidator.equals(
      "author summary id matches the authenticated user",
      comment.author.id,
      userB.id,
    );
  }
}
