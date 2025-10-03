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
 * Author can soft-delete their own comment and post-deletion rules are
 * enforced.
 *
 * Business flow:
 *
 * 1. Join as a registered member (author) and get authenticated session
 * 2. Create a community with a valid, unique name and allowed category
 * 3. Create a post in that community
 * 4. Create a root comment under the post
 * 5. Soft-delete the comment as its author
 * 6. Validate business constraints after deletion using available APIs:
 *
 *    - Cannot reply to a soft-deleted parent comment
 *    - Cannot delete the already-deleted comment again
 *
 * Notes:
 *
 * - Public GET/read endpoints are not provided in the available SDK; therefore
 *   validations depending on read operations (e.g., deletedAt visibility, post
 *   comment counts) are adapted to implementable error-path checks.
 */
export async function test_api_comment_delete_by_author(
  connection: api.IConnection,
) {
  // 1) Join as author (SDK sets Authorization header automatically)
  const author = await api.functional.auth.registeredMember.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      username: `user_${RandomGenerator.alphaNumeric(8)}`,
      password: `pw_${RandomGenerator.alphaNumeric(12)}`,
      displayName: RandomGenerator.name(1),
    } satisfies ICommunityPlatformRegisteredMember.IJoin,
  });
  typia.assert(author);

  // 2) Create a community with a pattern-safe name (alphanumeric only)
  const communityReq = {
    name: `c${RandomGenerator.alphaNumeric(10)}`,
    category: "Science" as IECommunityCategory,
    description: RandomGenerator.paragraph({ sentences: 8 }),
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      { body: communityReq },
    );
  typia.assert(community);

  // 3) Create a post in the community
  const postReq = {
    communityName: community.name,
    title: RandomGenerator.paragraph({ sentences: 5 }), // >= 5 chars
    body: RandomGenerator.content({
      paragraphs: 1,
      sentenceMin: 12,
      sentenceMax: 20,
    }), // >= 10 chars
    authorDisplayName: null,
  } satisfies ICommunityPlatformPost.ICreate;
  const post =
    await api.functional.communityPlatform.registeredMember.posts.create(
      connection,
      { body: postReq },
    );
  typia.assert(post);

  // 4) Author creates a root comment under the post
  const commentReq = {
    content: RandomGenerator.paragraph({ sentences: 6 }), // >= 2 chars
  } satisfies ICommunityPlatformComment.ICreate;
  const comment =
    await api.functional.communityPlatform.registeredMember.posts.comments.create(
      connection,
      { postId: post.id, body: commentReq },
    );
  typia.assert(comment);

  // Basic relationship validation
  TestValidator.equals(
    "created comment belongs to the created post",
    comment.postId,
    post.id,
  );

  // 5) Soft-delete the comment by its author
  await api.functional.communityPlatform.registeredMember.comments.erase(
    connection,
    { commentId: comment.id },
  );

  // 6-a) Cannot reply to a soft-deleted parent comment
  await TestValidator.error(
    "cannot create a reply to a soft-deleted parent comment",
    async () => {
      const replyReq = {
        content: RandomGenerator.paragraph({ sentences: 4 }),
        parentId: comment.id,
      } satisfies ICommunityPlatformComment.ICreate;
      await api.functional.communityPlatform.registeredMember.posts.comments.create(
        connection,
        { postId: post.id, body: replyReq },
      );
    },
  );

  // 6-b) Deleting the already-deleted comment again must fail
  await TestValidator.error(
    "deleting an already-deleted comment should fail",
    async () => {
      await api.functional.communityPlatform.registeredMember.comments.erase(
        connection,
        { commentId: comment.id },
      );
    },
  );
}
