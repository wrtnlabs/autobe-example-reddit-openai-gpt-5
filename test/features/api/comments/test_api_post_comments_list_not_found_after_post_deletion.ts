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
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformComment } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformComment";

export async function test_api_post_comments_list_not_found_after_post_deletion(
  connection: api.IConnection,
) {
  // 1) Register a member (authenticate)
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    username: `user_${RandomGenerator.alphaNumeric(10)}`,
    password: RandomGenerator.alphaNumeric(16),
    // Optional displayName omitted intentionally
  } satisfies ICommunityPlatformRegisteredMember.IJoin;
  const member: ICommunityPlatformRegisteredMember.IAuthorized =
    await api.functional.auth.registeredMember.join(connection, {
      body: joinBody,
    });
  typia.assert(member);

  // 2) Create a community
  const communityName = `qa-${RandomGenerator.alphaNumeric(8)}`; // satisfies name pattern
  // Generate short rule texts to satisfy MaxLength<100>
  const ruleText1 = RandomGenerator.paragraph({ sentences: 5 });
  const ruleText2 = RandomGenerator.paragraph({ sentences: 4 });
  const createCommunityBody = {
    name: communityName,
    category: "Science" as IECommunityCategory,
    description: RandomGenerator.paragraph({ sentences: 6 }),
    rules: [
      {
        order: 1,
        text: ruleText1.length > 90 ? ruleText1.slice(0, 90) : ruleText1,
      },
      {
        order: 2,
        text: ruleText2.length > 90 ? ruleText2.slice(0, 90) : ruleText2,
      },
    ],
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community: ICommunityPlatformCommunity =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      { body: createCommunityBody },
    );
  typia.assert(community);

  // 3) Create a post in the community
  const createPostBody = {
    communityName: communityName,
    title: RandomGenerator.paragraph({ sentences: 5 }), // >= 5 chars
    body: RandomGenerator.content({
      paragraphs: 2,
      sentenceMin: 8,
      sentenceMax: 12,
    }),
  } satisfies ICommunityPlatformPost.ICreate;
  const post: ICommunityPlatformPost =
    await api.functional.communityPlatform.registeredMember.posts.create(
      connection,
      { body: createPostBody },
    );
  typia.assert(post);

  // 4) Create a few comments (including a nested reply)
  const commentBodies: ICommunityPlatformComment.ICreate[] = [
    { content: RandomGenerator.paragraph({ sentences: 6 }) },
    { content: RandomGenerator.paragraph({ sentences: 4 }) },
    { content: RandomGenerator.paragraph({ sentences: 3 }) },
  ];
  const createdComments: ICommunityPlatformComment[] = [];
  for (const body of commentBodies) {
    const created =
      await api.functional.communityPlatform.registeredMember.posts.comments.create(
        connection,
        { postId: post.id, body },
      );
    typia.assert(created);
    createdComments.push(created);
  }
  // Create a reply to the first comment
  const replyBody = {
    content: RandomGenerator.paragraph({ sentences: 3 }),
    parentId: createdComments[0].id,
  } satisfies ICommunityPlatformComment.ICreate;
  const reply: ICommunityPlatformComment =
    await api.functional.communityPlatform.registeredMember.posts.comments.create(
      connection,
      { postId: post.id, body: replyBody },
    );
  typia.assert(reply);

  // 5) Pre-deletion: list comments should succeed and all belong to the post
  const listBefore: IPageICommunityPlatformComment =
    await api.functional.communityPlatform.posts.comments.index(connection, {
      postId: post.id,
      body: { limit: 20 } satisfies ICommunityPlatformComment.IRequest,
    });
  typia.assert(listBefore);
  for (const c of listBefore.data) {
    TestValidator.equals(
      "each listed comment belongs to the post before deletion",
      c.postId,
      post.id,
    );
  }

  // 6) Delete the post
  await api.functional.communityPlatform.registeredMember.posts.erase(
    connection,
    {
      postId: post.id,
    },
  );

  // 7) After deletion: listing comments must error (not-found behavior)
  await TestValidator.error(
    "listing comments for a deleted post should raise an error",
    async () => {
      await api.functional.communityPlatform.posts.comments.index(connection, {
        postId: post.id,
        body: {} satisfies ICommunityPlatformComment.IRequest,
      });
    },
  );
}
