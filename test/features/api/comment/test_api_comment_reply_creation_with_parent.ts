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

export async function test_api_comment_reply_creation_with_parent(
  connection: api.IConnection,
) {
  // 1) Join as a registered member (authenticate)
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    username: `user_${RandomGenerator.alphaNumeric(12)}`,
    password: "P@ssw0rd!",
    displayName: RandomGenerator.name(1),
  } satisfies ICommunityPlatformRegisteredMember.IJoin;
  const me = await api.functional.auth.registeredMember.join(connection, {
    body: joinBody,
  });
  typia.assert(me);

  // 2) Create a community
  const communityBody = {
    // ensure: starts with alpha, includes hyphen, ends with alnum, length 3-30
    name: `${RandomGenerator.alphabets(3)}-${RandomGenerator.alphaNumeric(6)}`,
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
    communityName: community.name,
    title: RandomGenerator.paragraph({ sentences: 5 }), // 5-120 chars (5 words ~ 15-35 chars typical)
    body: RandomGenerator.content({
      paragraphs: 2,
      sentenceMin: 10,
      sentenceMax: 16,
      wordMin: 3,
      wordMax: 8,
    }), // 10-10,000 chars comfortably satisfied
  } satisfies ICommunityPlatformPost.ICreate;
  const post =
    await api.functional.communityPlatform.registeredMember.posts.create(
      connection,
      { body: postBody },
    );
  typia.assert(post);

  // 4) Create a root comment on the post (parentId: null)
  const rootCommentBody = {
    content: RandomGenerator.paragraph({ sentences: 12 }),
    parentId: null,
  } satisfies ICommunityPlatformComment.ICreate;
  const root =
    await api.functional.communityPlatform.registeredMember.posts.comments.create(
      connection,
      { postId: post.id, body: rootCommentBody },
    );
  typia.assert(root);

  // Validate root comment associations
  TestValidator.equals(
    "root comment belongs to the post",
    root.postId,
    post.id,
  );
  await TestValidator.predicate(
    "root comment parentId is null or undefined",
    async () => root.parentId === null || root.parentId === undefined,
  );
  TestValidator.equals(
    "root comment author equals authenticated user",
    root.authorId,
    me.id,
  );
  TestValidator.equals(
    "root comment content echoes request",
    root.content,
    rootCommentBody.content,
  );

  // 5) Create a first-level reply (parentId = root.id) on the same post
  const reply1Body = {
    content: RandomGenerator.paragraph({ sentences: 6 }),
    parentId: root.id,
  } satisfies ICommunityPlatformComment.ICreate;
  const reply1 =
    await api.functional.communityPlatform.registeredMember.posts.comments.create(
      connection,
      { postId: post.id, body: reply1Body },
    );
  typia.assert(reply1);

  TestValidator.equals(
    "reply1 belongs to the same post",
    reply1.postId,
    post.id,
  );
  TestValidator.equals(
    "reply1 parent linkage to root",
    reply1.parentId!,
    root.id,
  );
  TestValidator.equals(
    "reply1 author equals authenticated user",
    reply1.authorId,
    me.id,
  );
  TestValidator.equals(
    "reply1 content echoes request",
    reply1.content,
    reply1Body.content,
  );

  // 6) Create a second-level reply to verify nested depth behavior
  const reply2Body = {
    content: RandomGenerator.paragraph({ sentences: 4 }),
    parentId: reply1.id,
  } satisfies ICommunityPlatformComment.ICreate;
  const reply2 =
    await api.functional.communityPlatform.registeredMember.posts.comments.create(
      connection,
      { postId: post.id, body: reply2Body },
    );
  typia.assert(reply2);

  TestValidator.equals(
    "reply2 belongs to the same post",
    reply2.postId,
    post.id,
  );
  TestValidator.equals(
    "reply2 parent linkage to reply1",
    reply2.parentId!,
    reply1.id,
  );
  TestValidator.equals(
    "reply2 author equals authenticated user",
    reply2.authorId,
    me.id,
  );

  // 7) Negative: cross-post parent reference should fail
  const otherPostBody = {
    communityName: community.name,
    title: RandomGenerator.paragraph({ sentences: 5 }),
    body: RandomGenerator.content({
      paragraphs: 1,
      sentenceMin: 10,
      sentenceMax: 16,
      wordMin: 3,
      wordMax: 8,
    }),
  } satisfies ICommunityPlatformPost.ICreate;
  const otherPost =
    await api.functional.communityPlatform.registeredMember.posts.create(
      connection,
      { body: otherPostBody },
    );
  typia.assert(otherPost);

  await TestValidator.error(
    "cannot create a reply using a parent from a different post",
    async () => {
      await api.functional.communityPlatform.registeredMember.posts.comments.create(
        connection,
        {
          postId: otherPost.id,
          body: {
            content: RandomGenerator.paragraph({ sentences: 3 }),
            parentId: root.id, // parent from the first post
          } satisfies ICommunityPlatformComment.ICreate,
        },
      );
    },
  );
}
