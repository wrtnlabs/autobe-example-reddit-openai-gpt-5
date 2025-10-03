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

export async function test_api_comment_creation_under_post_success(
  connection: api.IConnection,
) {
  /**
   * Validate successful comment creation under a post by an authenticated
   * member.
   *
   * Steps:
   *
   * 1. Join as a registered member (auth token auto-applied).
   * 2. Create a community with a valid, unique name and a valid category.
   * 3. Create a post in that community with valid title/body lengths.
   * 4. Create a comment under the post with valid content (2–2,000 chars).
   * 5. Validate response types and key business fields (postId, authorId,
   *    content).
   */

  // 1) Join as a registered member
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    username: RandomGenerator.name(1),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformRegisteredMember.IJoin;
  const member: ICommunityPlatformRegisteredMember.IAuthorized =
    await api.functional.auth.registeredMember.join(connection, {
      body: joinBody,
    });
  typia.assert(member);

  // 2) Create a community
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
  const communityName: string = `e2e_${RandomGenerator.alphaNumeric(12)}`; // valid per pattern
  const communityBody = {
    name: communityName,
    category: RandomGenerator.pick(categories),
    description: RandomGenerator.paragraph({ sentences: 8 }),
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community: ICommunityPlatformCommunity =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      { body: communityBody },
    );
  typia.assert(community);

  // 3) Create a post in this community
  const postBody = {
    communityName: community.name,
    title: RandomGenerator.paragraph({ sentences: 6 }),
    body: RandomGenerator.content({
      paragraphs: 2,
      sentenceMin: 10,
      sentenceMax: 20,
    }),
  } satisfies ICommunityPlatformPost.ICreate;
  const post: ICommunityPlatformPost =
    await api.functional.communityPlatform.registeredMember.posts.create(
      connection,
      { body: postBody },
    );
  typia.assert(post);

  // 4) Create a comment under the post
  const commentContent: string = RandomGenerator.paragraph({ sentences: 10 });
  const commentBody = {
    content: commentContent,
  } satisfies ICommunityPlatformComment.ICreate;
  const comment: ICommunityPlatformComment =
    await api.functional.communityPlatform.registeredMember.posts.comments.create(
      connection,
      {
        postId: post.id,
        body: commentBody,
      },
    );
  typia.assert(comment);

  // 5) Business validations
  TestValidator.equals(
    "comment.postId equals post.id",
    comment.postId,
    post.id,
  );
  TestValidator.equals(
    "comment.content equals creation input",
    comment.content,
    commentContent,
  );
  TestValidator.equals(
    "comment.authorId equals authenticated member id",
    comment.authorId,
    member.id,
  );
}
