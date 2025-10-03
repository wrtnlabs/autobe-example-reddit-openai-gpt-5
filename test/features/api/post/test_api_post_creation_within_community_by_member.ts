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
 * Post creation by an authenticated member in a non-joined community.
 *
 * This test verifies that a registered member can create a text-only post in a
 * target community without being a member of that community. It exercises:
 *
 * - Authentication via /auth/registeredMember/join
 * - Community creation via /communityPlatform/registeredMember/communities
 * - Post creation via /communityPlatform/registeredMember/posts
 *
 * Validations:
 *
 * 1. All API responses conform to their DTOs (typia.assert)
 * 2. The post is created successfully without joining the community
 * 3. The created post references the correct community name
 * 4. The author of the post matches the authenticated member id
 * 5. Title/body echo back the request
 * 6. Initial counters are set to zero (score/commentCount)
 */
export async function test_api_post_creation_within_community_by_member(
  connection: api.IConnection,
) {
  // Authenticate as a registered member (auto header management by SDK)
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    username: RandomGenerator.alphabets(8),
    password: "P@ssw0rd!",
    displayName: RandomGenerator.name(1),
  } satisfies ICommunityPlatformRegisteredMember.IJoin;
  const authorized = await api.functional.auth.registeredMember.join(
    connection,
    {
      body: joinBody,
    },
  );
  typia.assert(authorized);

  // Create a unique, pattern-compliant community
  const communityNameBase = "posts_comm_";
  const communitySuffix = RandomGenerator.alphaNumeric(8);
  const communityName = `${communityNameBase}${communitySuffix}`; // starts with letter, ends alphanumeric

  const communityBody = {
    name: communityName,
    category: "Tech & Programming",
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
    "community name should match input",
    community.name,
    communityName,
  );

  // Prepare post create payload
  const title = RandomGenerator.paragraph({
    sentences: 6,
    wordMin: 4,
    wordMax: 8,
  }); // <= 120 chars conservatively
  const body = RandomGenerator.content({
    paragraphs: 1,
    sentenceMin: 10,
    sentenceMax: 20,
    wordMin: 3,
    wordMax: 8,
  });
  const authorDisplayName = RandomGenerator.name(1); // <= 32 chars implied

  const postBody = {
    communityName,
    title,
    body,
    authorDisplayName,
  } satisfies ICommunityPlatformPost.ICreate;
  const post =
    await api.functional.communityPlatform.registeredMember.posts.create(
      connection,
      { body: postBody },
    );
  typia.assert(post);

  // Core validations
  TestValidator.equals(
    "post community name matches",
    post.community.name,
    communityName,
  );
  TestValidator.equals("post title matches", post.title, title);
  TestValidator.equals("post body matches", post.body, body);
  TestValidator.equals(
    "post author id matches authenticated member",
    post.author.id,
    authorized.id,
  );

  // Initial counters typically start at zero
  TestValidator.equals("post score starts at 0", post.score, 0);
  TestValidator.equals("post commentCount starts at 0", post.commentCount, 0);
}
