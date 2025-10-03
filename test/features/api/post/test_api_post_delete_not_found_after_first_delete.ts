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
 * Validate that deleting a post is idempotent from the client perspective: the
 * first deletion succeeds, and the second deletion fails because the post has
 * already been removed.
 *
 * Steps:
 *
 * 1. Join as a registered member (User A) to acquire an authenticated session
 * 2. Create a community with a valid name and random category
 * 3. Create a post in that community with valid title/body
 * 4. Delete the post (should succeed)
 * 5. Attempt to delete the same post again (should throw)
 *
 * Notes:
 *
 * - We assert only business effects (error thrown on second delete), and avoid
 *   checking specific HTTP status codes per E2E policy.
 * - All non-void responses are validated with typia.assert().
 */
export async function test_api_post_delete_not_found_after_first_delete(
  connection: api.IConnection,
) {
  // 1) Authenticate (join) as registered member User A
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const username: string = `user_${RandomGenerator.alphaNumeric(12)}`;
  const authorized = await api.functional.auth.registeredMember.join(
    connection,
    {
      body: {
        email,
        username,
        password: "pass-1234",
      } satisfies ICommunityPlatformRegisteredMember.IJoin,
    },
  );
  typia.assert(authorized);

  // 2) Create a community to host the post
  const communityName: string = `e2e${RandomGenerator.alphaNumeric(10)}`; // starts with letter, alnum only
  const community =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      {
        body: {
          name: communityName as string, // pattern-conformant 3–30 chars
          category: typia.random<IECommunityCategory>(),
          description: RandomGenerator.paragraph({
            sentences: 8,
            wordMin: 3,
            wordMax: 8,
          }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);

  // 3) Create a post in the created community
  const post =
    await api.functional.communityPlatform.registeredMember.posts.create(
      connection,
      {
        body: {
          communityName: community.name,
          title: RandomGenerator.paragraph({
            sentences: 6,
            wordMin: 3,
            wordMax: 8,
          }),
          body: RandomGenerator.content({
            paragraphs: 2,
            sentenceMin: 10,
            sentenceMax: 15,
            wordMin: 3,
            wordMax: 8,
          }),
          authorDisplayName: null,
        } satisfies ICommunityPlatformPost.ICreate,
      },
    );
  typia.assert(post);

  // Basic sanity checks on created entities
  TestValidator.equals(
    "post community name matches the created community",
    post.community.name,
    community.name,
  );
  TestValidator.equals(
    "post author is the logged-in user",
    post.author.id,
    authorized.id,
  );

  // 4) First deletion should succeed (void response)
  await api.functional.communityPlatform.registeredMember.posts.erase(
    connection,
    {
      postId: post.id,
    },
  );

  // 5) Second deletion should fail with an error (no status code assertion)
  await TestValidator.error(
    "second delete attempt throws because the post is already deleted",
    async () => {
      await api.functional.communityPlatform.registeredMember.posts.erase(
        connection,
        {
          postId: post.id,
        },
      );
    },
  );
}
