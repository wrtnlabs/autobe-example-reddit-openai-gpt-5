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

export async function test_api_post_delete_author_ownership_success(
  connection: api.IConnection,
) {
  // 1) Register a new member (User A)
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    username: RandomGenerator.name(1),
    password: RandomGenerator.alphaNumeric(12),
    displayName: RandomGenerator.name(1),
  } satisfies ICommunityPlatformRegisteredMember.IJoin;
  const auth = await api.functional.auth.registeredMember.join(connection, {
    body: joinBody,
  });
  typia.assert(auth);

  // 2) Create a community with a valid, unique name and allowed category
  const communityName = `e2e-${RandomGenerator.alphaNumeric(12)}`; // starts with alpha, ends alphanumeric, includes hyphen
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
  ] as const satisfies readonly IECommunityCategory[];
  const category: IECommunityCategory = RandomGenerator.pick(categories);
  const communityBody = {
    name: communityName,
    category,
    description: RandomGenerator.paragraph({
      sentences: 8,
      wordMin: 3,
      wordMax: 8,
    }),
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      { body: communityBody },
    );
  typia.assert(community);
  TestValidator.equals(
    "created community has requested name",
    community.name,
    communityName,
  );

  // 3) Create a post under the created community
  const postBody = {
    communityName: communityName,
    title: RandomGenerator.paragraph({ sentences: 5, wordMin: 4, wordMax: 8 }),
    body: RandomGenerator.content({
      paragraphs: 2,
      sentenceMin: 10,
      sentenceMax: 15,
      wordMin: 3,
      wordMax: 8,
    }),
  } satisfies ICommunityPlatformPost.ICreate;
  const post =
    await api.functional.communityPlatform.registeredMember.posts.create(
      connection,
      { body: postBody },
    );
  typia.assert(post);
  TestValidator.equals(
    "post embeds the correct community name",
    post.community.name,
    communityName,
  );

  // 4) Delete the post as the author (should succeed)
  await api.functional.communityPlatform.registeredMember.posts.erase(
    connection,
    {
      postId: post.id,
    },
  );

  // 5) Attempt to delete again (should error per non-idempotent spec)
  await TestValidator.error("second delete attempt must fail", async () => {
    await api.functional.communityPlatform.registeredMember.posts.erase(
      connection,
      { postId: post.id },
    );
  });
}
