import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IClientContext } from "@ORGANIZATION/PROJECT-api/lib/structures/IClientContext";
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
 * Validate unauthenticated guard on post update, then success after
 * authentication.
 *
 * Steps:
 *
 * 1. Join as a member to obtain an authenticated session
 * 2. Create a community (valid name pattern) and a post under it
 * 3. Attempt to update the post using an unauthenticated connection → expect
 *    failure
 * 4. Retry the update with the authenticated connection → expect success
 * 5. Verify mutable fields updated and immutable fields unchanged
 */
export async function test_api_post_update_unauthenticated_guard(
  connection: api.IConnection,
) {
  // 1) Join as a registered member (authentication handled by SDK)
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    username: `${RandomGenerator.name(1)}_${RandomGenerator.alphaNumeric(6)}`,
    password: `Pw_${RandomGenerator.alphaNumeric(10)}`,
    displayName: RandomGenerator.name(1),
  } satisfies ICommunityPlatformRegisteredMember.IJoin;
  const authorized = await api.functional.auth.registeredMember.join(
    connection,
    {
      body: joinBody,
    },
  );
  typia.assert(authorized);

  // 2) Create a community with valid name and category
  const communityName: string = `e2e${RandomGenerator.alphabets(8)}`; // starts/ends alphanumeric, length OK
  const communityCreateBody = {
    name: communityName as string,
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
    description: RandomGenerator.paragraph({ sentences: 6 }),
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      { body: communityCreateBody },
    );
  typia.assert(community);

  // 3) Create a post in the community
  const createTitle = RandomGenerator.paragraph({ sentences: 6 });
  const createBody = RandomGenerator.content({
    paragraphs: 2,
    sentenceMin: 10,
    sentenceMax: 16,
    wordMin: 4,
    wordMax: 10,
  });
  const postCreateBody = {
    communityName: communityName,
    title: createTitle,
    body: createBody,
    authorDisplayName: RandomGenerator.name(1),
  } satisfies ICommunityPlatformPost.ICreate;
  const post: ICommunityPlatformPost =
    await api.functional.communityPlatform.registeredMember.posts.create(
      connection,
      { body: postCreateBody },
    );
  typia.assert(post);

  // Prepare new values for update
  const newTitle = RandomGenerator.paragraph({ sentences: 6 });
  const newBody = RandomGenerator.content({
    paragraphs: 2,
    sentenceMin: 10,
    sentenceMax: 16,
    wordMin: 4,
    wordMax: 10,
  });
  const updateBody = {
    title: newTitle,
    body: newBody,
  } satisfies ICommunityPlatformPost.IUpdate;

  // 4) Attempt to update without authentication (guest guard)
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "unauthenticated user cannot update a post",
    async () => {
      await api.functional.communityPlatform.registeredMember.posts.update(
        unauthConn,
        {
          postId: post.id,
          body: updateBody,
        },
      );
    },
  );

  // 5) Retry update with authenticated connection → expect success
  const updated: ICommunityPlatformPost =
    await api.functional.communityPlatform.registeredMember.posts.update(
      connection,
      {
        postId: post.id,
        body: updateBody,
      },
    );
  typia.assert(updated);

  // 6) Validate immutable and updated fields
  TestValidator.equals("post id should remain unchanged", updated.id, post.id);
  TestValidator.equals(
    "community association should remain unchanged",
    updated.community.name,
    post.community.name,
  );
  TestValidator.equals(
    "author should remain unchanged",
    updated.author.id,
    post.author.id,
  );
  TestValidator.equals("title should be updated", updated.title, newTitle);
  TestValidator.equals("body should be updated", updated.body, newBody);
  TestValidator.notEquals(
    "updatedAt should be changed after update",
    updated.updatedAt,
    post.updatedAt,
  );
}
