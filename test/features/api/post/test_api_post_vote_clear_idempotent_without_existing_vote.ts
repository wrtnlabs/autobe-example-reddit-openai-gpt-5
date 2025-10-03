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
 * Idempotent vote clear when no prior vote exists.
 *
 * Business objective: Ensure DELETE
 * /communityPlatform/registeredMember/posts/{postId}/vote behaves as a no-op
 * and remains idempotent when the caller has not voted yet.
 *
 * Steps:
 *
 * 1. Register author (A) and obtain authenticated session.
 * 2. Create a community (valid name format and category).
 * 3. Author (A) creates a post; verify type and initial invariants.
 * 4. Register a second member (B) – the voter context – switching session.
 * 5. Invoke vote.erase once (no prior vote → success, no content).
 * 6. Invoke vote.erase again to confirm idempotency (still success).
 *
 * Notes:
 *
 * - Without a read endpoint to reload the post after DELETE, we validate initial
 *   invariants at creation time and rely on success/no-error semantics plus the
 *   double-call for idempotency.
 */
export async function test_api_post_vote_clear_idempotent_without_existing_vote(
  connection: api.IConnection,
) {
  // 1) Register author (A)
  const authorJoin = await api.functional.auth.registeredMember.join(
    connection,
    {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        username: `author_${RandomGenerator.alphaNumeric(12)}`,
        password: RandomGenerator.alphaNumeric(16),
        displayName: RandomGenerator.name(2),
      } satisfies ICommunityPlatformRegisteredMember.IJoin,
    },
  );
  typia.assert(authorJoin);

  // 2) Create a community with a valid name and category
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
  const category = RandomGenerator.pick(categories);
  const communityName = `c_${RandomGenerator.alphaNumeric(10)}`; // 3–30 chars, alnum+[_-], starts with alnum

  const community =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      {
        body: {
          name: communityName,
          category,
          description: RandomGenerator.paragraph({ sentences: 8 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);

  // 3) Author creates a post in that community
  const post =
    await api.functional.communityPlatform.registeredMember.posts.create(
      connection,
      {
        body: {
          communityName: communityName,
          title: RandomGenerator.paragraph({ sentences: 5 }),
          body: RandomGenerator.content({
            paragraphs: 2,
            sentenceMin: 8,
            sentenceMax: 16,
            wordMin: 3,
            wordMax: 8,
          }),
          authorDisplayName: RandomGenerator.name(1),
        } satisfies ICommunityPlatformPost.ICreate,
      },
    );
  typia.assert(post);

  // Initial invariants at creation time
  TestValidator.equals("initial post score should be zero", post.score, 0);
  TestValidator.predicate(
    "initial myVote is either NONE, null, or undefined",
    post.myVote === "NONE" || post.myVote === null || post.myVote === undefined,
  );

  // 4) Register voter (B) – this switches the SDK session to voter
  const voterJoin = await api.functional.auth.registeredMember.join(
    connection,
    {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        username: `voter_${RandomGenerator.alphaNumeric(12)}`,
        password: RandomGenerator.alphaNumeric(16),
        displayName: RandomGenerator.name(2),
      } satisfies ICommunityPlatformRegisteredMember.IJoin,
    },
  );
  typia.assert(voterJoin);
  TestValidator.notEquals(
    "author and voter must be different users",
    voterJoin.id,
    authorJoin.id,
  );

  // 5) Clear vote when no vote exists yet – should succeed (no error, no content)
  await api.functional.communityPlatform.registeredMember.posts.vote.erase(
    connection,
    {
      postId: post.id,
    },
  );

  // 6) Call again to confirm idempotency – still no error
  await api.functional.communityPlatform.registeredMember.posts.vote.erase(
    connection,
    {
      postId: post.id,
    },
  );
}
