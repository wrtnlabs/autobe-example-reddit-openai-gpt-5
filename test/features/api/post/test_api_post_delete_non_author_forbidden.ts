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
 * Validate non-author deletion is forbidden and author deletion succeeds.
 *
 * Workflow:
 *
 * 1. Create User A (author) and User B (another member) using join endpoint.
 *
 *    - Maintain two independent connections (connA, connB) so each holds its own
 *         Authorization.
 * 2. User A creates a community with a valid unique name and a category.
 * 3. User A creates a post in that community with valid title/body.
 * 4. Attempt to DELETE the post as User B → expect an error (author-only guard).
 * 5. Retry DELETE as User A → expect success (void).
 * 6. Confirm deletion by attempting DELETE again as User A → expect an error
 *    (already deleted / not found).
 *
 * Notes:
 *
 * - We validate only business outcomes (error vs success) without asserting HTTP
 *   status codes or error messages.
 * - Without read endpoints, the second failing DELETE acts as deletion
 *   confirmation.
 */
export async function test_api_post_delete_non_author_forbidden(
  connection: api.IConnection,
) {
  // Prepare two isolated connections to maintain separate sessions
  const connA: api.IConnection = { ...connection, headers: {} }; // Author
  const connB: api.IConnection = { ...connection, headers: {} }; // Non-author

  // 1) Join User A (author)
  const joinBodyA = {
    email: typia.random<string & tags.Format<"email">>(),
    username: `usera_${RandomGenerator.alphaNumeric(8)}`,
    password: RandomGenerator.alphaNumeric(12),
    displayName: RandomGenerator.name(1),
  } satisfies ICommunityPlatformRegisteredMember.IJoin;
  const memberA = await api.functional.auth.registeredMember.join(connA, {
    body: joinBodyA,
  });
  typia.assert(memberA);

  // 1-2) Join User B (non-author)
  const joinBodyB = {
    email: typia.random<string & tags.Format<"email">>(),
    username: `userb_${RandomGenerator.alphaNumeric(8)}`,
    password: RandomGenerator.alphaNumeric(12),
    displayName: RandomGenerator.name(1),
  } satisfies ICommunityPlatformRegisteredMember.IJoin;
  const memberB = await api.functional.auth.registeredMember.join(connB, {
    body: joinBodyB,
  });
  typia.assert(memberB);

  // 2) User A creates a community
  const communityName: string & tags.MinLength<3> & tags.MaxLength<30> =
    `c_${RandomGenerator.alphaNumeric(10)}` as string; // value conforms to required pattern/length
  const communityBody = {
    name: communityName,
    category: typia.random<IECommunityCategory>(),
    description: RandomGenerator.paragraph({
      sentences: 12,
      wordMin: 3,
      wordMax: 8,
    }),
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connA,
      { body: communityBody },
    );
  typia.assert(community);
  TestValidator.equals(
    "community name matches input",
    community.name,
    communityName,
  );

  // 3) User A creates a post in the community
  const postBody = {
    communityName: communityName,
    title: RandomGenerator.paragraph({ sentences: 6, wordMin: 3, wordMax: 8 }),
    body: RandomGenerator.content({
      paragraphs: 2,
      sentenceMin: 12,
      sentenceMax: 18,
      wordMin: 3,
      wordMax: 8,
    }),
    authorDisplayName: RandomGenerator.name(1),
  } satisfies ICommunityPlatformPost.ICreate;
  const post =
    await api.functional.communityPlatform.registeredMember.posts.create(
      connA,
      { body: postBody },
    );
  typia.assert(post);
  TestValidator.equals(
    "post targets requested community",
    post.community.name,
    communityName,
  );
  TestValidator.equals("post author is user A", post.author.id, memberA.id);

  // 4) Non-author (User B) attempts to delete → should fail
  await TestValidator.error("non-author cannot delete the post", async () => {
    await api.functional.communityPlatform.registeredMember.posts.erase(connB, {
      postId: post.id,
    });
  });

  // 5) Author (User A) deletes successfully
  await api.functional.communityPlatform.registeredMember.posts.erase(connA, {
    postId: post.id,
  });

  // 6) Confirm deletion by attempting to delete again → should fail
  await TestValidator.error(
    "deleted post cannot be deleted again",
    async () => {
      await api.functional.communityPlatform.registeredMember.posts.erase(
        connA,
        { postId: post.id },
      );
    },
  );
}
