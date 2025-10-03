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
 * Non-author must not be able to delete another user's comment.
 *
 * Flow:
 *
 * 1. Join User A (author) and User B (non-author) using separate connections
 * 2. As User A: create a community, a post in that community, and a comment on the
 *    post
 * 3. As User B: attempt to delete User A's comment and expect an error
 * 4. As User A: delete the same comment successfully to prove it still existed
 */
export async function test_api_comment_delete_forbidden_by_non_author(
  connection: api.IConnection,
) {
  // 1) User A joins (token bound to `connection` by SDK)
  const userAEmail: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const userAAuth = await api.functional.auth.registeredMember.join(
    connection,
    {
      body: {
        email: userAEmail,
        username: RandomGenerator.name(1),
        password: `P${RandomGenerator.alphaNumeric(10)}`,
      } satisfies ICommunityPlatformRegisteredMember.IJoin,
    },
  );
  typia.assert(userAAuth);

  // Prepare a separate connection for User B, starting unauthenticated
  const connectionB: api.IConnection = { ...connection, headers: {} };

  // 1) User B joins (token bound to `connectionB` by SDK)
  const userBEmail: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const userBAuth = await api.functional.auth.registeredMember.join(
    connectionB,
    {
      body: {
        email: userBEmail,
        username: RandomGenerator.name(1),
        password: `P${RandomGenerator.alphaNumeric(10)}`,
      } satisfies ICommunityPlatformRegisteredMember.IJoin,
    },
  );
  typia.assert(userBAuth);

  // 2) As User A: create a community
  const categories = [
    "Tech & Programming",
    "Science",
    "Movies & TV",
    "Games",
    "Sports",
    "Lifestyle & Wellness",
    "Study & Education",
    "Art & Design",
    "Business & Finance",
    "News & Current Affairs",
  ] as const;
  const communityName = `e2e_${RandomGenerator.alphaNumeric(8)}`; // complies with naming regex
  const community =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      {
        body: {
          name: communityName,
          category: RandomGenerator.pick(categories),
          description: RandomGenerator.paragraph({ sentences: 8 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);

  // 2) As User A: create a post in the community
  const post =
    await api.functional.communityPlatform.registeredMember.posts.create(
      connection,
      {
        body: {
          communityName,
          title: RandomGenerator.paragraph({ sentences: 5 }),
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

  // 2) As User A: create a comment on the post
  const comment =
    await api.functional.communityPlatform.registeredMember.posts.comments.create(
      connection,
      {
        postId: post.id,
        body: {
          content: RandomGenerator.paragraph({ sentences: 6 }),
        } satisfies ICommunityPlatformComment.ICreate,
      },
    );
  typia.assert(comment);

  // Relationship validations
  TestValidator.equals(
    "comment belongs to the created post",
    comment.postId,
    post.id,
  );
  TestValidator.equals(
    "comment author is User A",
    comment.authorId,
    userAAuth.id,
  );

  // 3) As User B (non-author): attempt to delete User A's comment -> expect error
  await TestValidator.error(
    "non-author cannot delete another user's comment",
    async () => {
      await api.functional.communityPlatform.registeredMember.comments.erase(
        connectionB,
        { commentId: comment.id },
      );
    },
  );

  // 4) As User A (author): delete the comment successfully (void response)
  await api.functional.communityPlatform.registeredMember.comments.erase(
    connection,
    { commentId: comment.id },
  );
}
