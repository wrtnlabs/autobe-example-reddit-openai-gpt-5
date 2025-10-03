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
 * Update after delete must fail for posts (soft-deleted not editable).
 *
 * Flow:
 *
 * 1. Register a member (obtains auth session automatically).
 * 2. Create a community (valid name and category).
 * 3. Create a post in that community; capture postId.
 * 4. Delete the post (soft delete).
 * 5. Attempt to update the deleted post with valid payload → expect an error
 *    (not-found semantics).
 *
 * Notes:
 *
 * - We validate non-void responses with typia.assert().
 * - We do not assert specific HTTP status codes; only that an error occurs.
 */
export async function test_api_post_update_not_found_when_deleted(
  connection: api.IConnection,
) {
  // 1) Register a member (author)
  const joinOutput = await api.functional.auth.registeredMember.join(
    connection,
    {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        username: RandomGenerator.name(1).replace(/\s+/g, ""),
        password: RandomGenerator.alphaNumeric(16),
      } satisfies ICommunityPlatformRegisteredMember.IJoin,
    },
  );
  typia.assert(joinOutput);

  // 2) Create a community
  const community =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      {
        body: {
          name: RandomGenerator.alphaNumeric(10),
          category: "Tech & Programming",
          description: RandomGenerator.paragraph({
            sentences: 8,
            wordMin: 3,
            wordMax: 8,
          }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);

  // 3) Create a post under the community
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
            sentenceMin: 8,
            sentenceMax: 15,
            wordMin: 3,
            wordMax: 8,
          }),
          authorDisplayName: RandomGenerator.name(1),
        } satisfies ICommunityPlatformPost.ICreate,
      },
    );
  typia.assert(post);

  // 4) Delete the post (soft-delete)
  await api.functional.communityPlatform.registeredMember.posts.erase(
    connection,
    { postId: post.id },
  );

  // 5) Attempt to update the deleted post → expect error (not-found semantics)
  await TestValidator.error("updating a deleted post must fail", async () => {
    await api.functional.communityPlatform.registeredMember.posts.update(
      connection,
      {
        postId: post.id,
        body: {
          title: RandomGenerator.paragraph({
            sentences: 5,
            wordMin: 3,
            wordMax: 8,
          }),
          body: RandomGenerator.content({
            paragraphs: 2,
            sentenceMin: 6,
            sentenceMax: 12,
            wordMin: 3,
            wordMax: 8,
          }),
        } satisfies ICommunityPlatformPost.IUpdate,
      },
    );
  });
}
