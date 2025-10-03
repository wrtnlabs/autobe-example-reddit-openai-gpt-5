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

export async function test_api_comment_update_forbidden_by_non_author(
  connection: api.IConnection,
) {
  // 1) Prepare two isolated connections so that each user maintains its own session
  const connA: api.IConnection = { ...connection, headers: {} }; // author
  const connB: api.IConnection = { ...connection, headers: {} }; // non-author

  // 2) User A (author) joins
  const joinBodyA = {
    email: typia.random<string & tags.Format<"email">>(),
    username: `user_${RandomGenerator.alphaNumeric(12)}`,
    password: RandomGenerator.alphaNumeric(16),
    displayName: RandomGenerator.name(1),
    client: {
      userAgent: "e2e-tests",
      clientPlatform: "node",
      clientDevice: "bot",
      sessionType: "standard",
    },
  } satisfies ICommunityPlatformRegisteredMember.IJoin;
  const authA: ICommunityPlatformRegisteredMember.IAuthorized =
    await api.functional.auth.registeredMember.join(connA, { body: joinBodyA });
  typia.assert(authA);

  // 3) Create a community under User A
  const communityName: string = `e2e_${RandomGenerator.alphaNumeric(10)}`; // valid per pattern
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
  const communityCreate = {
    name: communityName,
    category: RandomGenerator.pick(categories),
    description: RandomGenerator.paragraph({ sentences: 10 }),
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community: ICommunityPlatformCommunity =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connA,
      { body: communityCreate },
    );
  typia.assert(community);

  // 4) Create a post in the community as User A
  const postCreate = {
    communityName: community.name,
    title: RandomGenerator.paragraph({ sentences: 6 }),
    body: RandomGenerator.content({
      paragraphs: 1,
      sentenceMin: 12,
      sentenceMax: 18,
      wordMin: 3,
      wordMax: 8,
    }),
    authorDisplayName: RandomGenerator.name(1),
  } satisfies ICommunityPlatformPost.ICreate;
  const post: ICommunityPlatformPost =
    await api.functional.communityPlatform.registeredMember.posts.create(
      connA,
      {
        body: postCreate,
      },
    );
  typia.assert(post);

  // 5) Create a comment on the post as User A
  const commentCreate = {
    content: RandomGenerator.paragraph({ sentences: 8 }),
  } satisfies ICommunityPlatformComment.ICreate;
  const original: ICommunityPlatformComment =
    await api.functional.communityPlatform.registeredMember.posts.comments.create(
      connA,
      {
        postId: post.id,
        body: commentCreate,
      },
    );
  typia.assert(original);

  // Ownership sanity check: created comment belongs to User A
  TestValidator.equals(
    "created comment is authored by user A",
    original.authorId,
    authA.id,
  );

  const originalContent: string = original.content;
  const originalUpdatedAt: string = original.updatedAt;

  // 6) User B (non-author) joins
  const joinBodyB = {
    email: typia.random<string & tags.Format<"email">>(),
    username: `user_${RandomGenerator.alphaNumeric(12)}`,
    password: RandomGenerator.alphaNumeric(16),
    displayName: RandomGenerator.name(1),
    client: {
      userAgent: "e2e-tests",
      clientPlatform: "node",
      clientDevice: "bot",
      sessionType: "standard",
    },
  } satisfies ICommunityPlatformRegisteredMember.IJoin;
  const authB: ICommunityPlatformRegisteredMember.IAuthorized =
    await api.functional.auth.registeredMember.join(connB, { body: joinBodyB });
  typia.assert(authB);

  // 7) Non-author attempts to update the comment -> must be forbidden (error)
  const nonAuthorAttempt = {
    content: RandomGenerator.paragraph({ sentences: 7 }),
  } satisfies ICommunityPlatformComment.IUpdate;
  await TestValidator.error(
    "non-author cannot edit another user's comment",
    async () => {
      await api.functional.communityPlatform.registeredMember.posts.comments.update(
        connB,
        {
          postId: post.id,
          commentId: original.id,
          body: nonAuthorAttempt,
        },
      );
    },
  );

  // 8) Author updates the comment successfully
  const authorUpdateBody = {
    content: RandomGenerator.paragraph({ sentences: 9 }),
  } satisfies ICommunityPlatformComment.IUpdate;
  const updatedByAuthor: ICommunityPlatformComment =
    await api.functional.communityPlatform.registeredMember.posts.comments.update(
      connA,
      {
        postId: post.id,
        commentId: original.id,
        body: authorUpdateBody,
      },
    );
  typia.assert(updatedByAuthor);

  // Validate update success and integrity
  TestValidator.equals(
    "updated comment id should match target",
    updatedByAuthor.id,
    original.id,
  );
  TestValidator.equals(
    "updated comment belongs to same post",
    updatedByAuthor.postId,
    post.id,
  );
  TestValidator.equals(
    "updated comment author remains user A",
    updatedByAuthor.authorId,
    authA.id,
  );
  const expectedContent: string = typia.assert<string>(
    authorUpdateBody.content!,
  );
  TestValidator.equals(
    "author update applied new content",
    updatedByAuthor.content,
    expectedContent,
  );
  TestValidator.notEquals(
    "updatedAt should change after author update",
    updatedByAuthor.updatedAt,
    originalUpdatedAt,
  );
  TestValidator.notEquals(
    "content should change from original after author update",
    updatedByAuthor.content,
    originalContent,
  );
}
