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
import type { ICommunityRef } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityRef";
import type { IECommunityCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityCategory";
import type { IECommunityPlatformCommunityCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformCommunityCategory";
import type { IECommunityPlatformVoteState } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformVoteState";
import type { IEPostSort } from "@ORGANIZATION/PROJECT-api/lib/structures/IEPostSort";
import type { IEVoteState } from "@ORGANIZATION/PROJECT-api/lib/structures/IEVoteState";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformPost } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformPost";
import type { IUserRef } from "@ORGANIZATION/PROJECT-api/lib/structures/IUserRef";

/**
 * Ensure community post listing fails after community deletion.
 *
 * Business context:
 *
 * - Communities are hard-deleted through the registered member endpoint, with
 *   cascade removing posts and related data.
 * - Public listing of community posts resolves the community by name; after
 *   deletion, the community must be not-found and the list should fail.
 *
 * Steps:
 *
 * 1. Register and authenticate User A.
 * 2. Create a community with a unique, pattern-conforming name.
 * 3. Create a post in that community (optional realism).
 * 4. Delete the community as its owner.
 * 5. Attempt to list posts for the deleted community and expect an error.
 */
export async function test_api_community_posts_not_found_after_community_deletion(
  connection: api.IConnection,
) {
  // 1) Register and authenticate User A
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    username: `user_${RandomGenerator.alphaNumeric(10)}`,
    password: RandomGenerator.alphaNumeric(16),
    displayName: RandomGenerator.name(1),
  } satisfies ICommunityPlatformRegisteredMember.IJoin;
  const auth: ICommunityPlatformRegisteredMember.IAuthorized =
    await api.functional.auth.registeredMember.join(connection, {
      body: joinBody,
    });
  typia.assert(auth);

  // 2) Create a community with a unique, valid name and category
  const communityName: string = `e2e${RandomGenerator.alphaNumeric(10)}`; // starts with alpha, ends alnum
  const createCommunityBody = {
    name: communityName,
    category: typia.random<IECommunityCategory>(),
    description: RandomGenerator.paragraph({ sentences: 12 }), // <= 500 chars comfortably
    rules: [
      {
        order: 1,
        text: RandomGenerator.paragraph({ sentences: 5 }),
      },
      {
        order: 2,
        text: RandomGenerator.paragraph({ sentences: 4 }),
      },
    ] satisfies ICommunityPlatformCommunityRule.ICreateArray,
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community: ICommunityPlatformCommunity =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      { body: createCommunityBody },
    );
  typia.assert(community);
  TestValidator.equals(
    "created community name should equal request name",
    community.name,
    communityName,
  );

  // 3) Create a post in that community (optional realism)
  const createPostBody = {
    communityName: communityName,
    title: RandomGenerator.paragraph({ sentences: 6 }),
    body: RandomGenerator.content({
      paragraphs: 2,
      sentenceMin: 4,
      sentenceMax: 8,
      wordMin: 3,
      wordMax: 7,
    }),
    authorDisplayName: RandomGenerator.name(1),
  } satisfies ICommunityPlatformPost.ICreate;
  const post: ICommunityPlatformPost =
    await api.functional.communityPlatform.registeredMember.posts.create(
      connection,
      { body: createPostBody },
    );
  typia.assert(post);
  TestValidator.equals(
    "post.community.name should match created community name",
    post.community.name,
    communityName,
  );

  // 4) Delete the community as its owner (hard delete with cascade)
  await api.functional.communityPlatform.registeredMember.communities.erase(
    connection,
    { communityName },
  );

  // 5) Listing posts for the deleted community must fail (community not resolvable)
  await TestValidator.error(
    "listing posts for a deleted community should fail",
    async () => {
      await api.functional.communityPlatform.communities.posts.index(
        connection,
        {
          communityName,
          body: { sort: "newest" } satisfies ICommunityPlatformPost.IRequest,
        },
      );
    },
  );
}
