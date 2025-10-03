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

export async function test_api_comment_detail_public_read(
  connection: api.IConnection,
) {
  /**
   * Validate public read-open access of a single comment.
   *
   * Flow:
   *
   * 1. Join as a registered member (acquires authenticated session)
   * 2. Create a community (valid unique name and category)
   * 3. Create a post under the community
   * 4. Create a root comment under the post
   * 5. Publicly GET the comment by id with an unauthenticated connection
   * 6. Validate returned fields and open-read behavior
   */

  // 1) Join as a registered member
  const member = await api.functional.auth.registeredMember.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      username: `user_${RandomGenerator.alphaNumeric(12)}`,
      password: `P@ssw0rd_${RandomGenerator.alphaNumeric(6)}`,
      displayName: RandomGenerator.name(),
    } satisfies ICommunityPlatformRegisteredMember.IJoin,
  });
  typia.assert(member);

  // 2) Create a community with a valid unique name
  const communityName: string = `c_${RandomGenerator.alphaNumeric(10)}`; // starts with alpha, includes only [a-z0-9_]
  const community =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      {
        body: {
          name: communityName,
          category: RandomGenerator.pick([
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
          ] as const),
          description: RandomGenerator.paragraph({ sentences: 8 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);
  TestValidator.equals(
    "community name should equal requested name",
    community.name,
    communityName,
  );

  // 3) Create a post under the community
  const postTitle = RandomGenerator.paragraph({ sentences: 5 });
  const postBody = RandomGenerator.content({
    paragraphs: 1,
    sentenceMin: 12,
    sentenceMax: 20,
    wordMin: 3,
    wordMax: 8,
  });
  const post =
    await api.functional.communityPlatform.registeredMember.posts.create(
      connection,
      {
        body: {
          communityName,
          title: postTitle,
          body: postBody,
          authorDisplayName: RandomGenerator.name(1),
        } satisfies ICommunityPlatformPost.ICreate,
      },
    );
  typia.assert(post);
  TestValidator.equals(
    "post.community.name should equal requested communityName",
    post.community.name,
    communityName,
  );

  // 4) Create a root comment under the post
  const commentContent = RandomGenerator.paragraph({ sentences: 8 }); // 2–2,000 chars ensured
  const created =
    await api.functional.communityPlatform.registeredMember.posts.comments.create(
      connection,
      {
        postId: post.id,
        body: {
          content: commentContent,
        } satisfies ICommunityPlatformComment.ICreate,
      },
    );
  typia.assert(created);
  TestValidator.equals(
    "created.comment.postId should equal post.id",
    created.postId,
    post.id,
  );
  TestValidator.equals(
    "created.comment.authorId should equal member.id",
    created.authorId,
    member.id,
  );

  // 5) Publicly GET the comment by id with an unauthenticated connection
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  const read = await api.functional.communityPlatform.comments.at(unauthConn, {
    commentId: created.id,
  });
  typia.assert(read);

  // 6) Validate returned fields and open-read behavior
  TestValidator.equals(
    "public read returns the same comment id",
    read.id,
    created.id,
  );
  TestValidator.equals("public read preserves postId", read.postId, post.id);
  TestValidator.equals(
    "public read preserves content",
    read.content,
    commentContent,
  );
  await TestValidator.predicate(
    "deletedAt should be nullish (null or undefined) for a newly created comment",
    async () => read.deletedAt === null || read.deletedAt === undefined,
  );
  TestValidator.equals(
    "myVote should be undefined on unauthenticated read",
    read.myVote,
    undefined,
  );
  TestValidator.equals(
    "authorId in read matches creator id",
    read.authorId,
    member.id,
  );

  // Optional: if author object is present, ensure alignment with authorId
  if (read.author !== undefined) {
    typia.assert(read.author);
    TestValidator.equals(
      "author object id matches authorId",
      read.author.id,
      read.authorId,
    );
  }
}
