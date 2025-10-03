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

export async function test_api_comment_vote_clear_idempotent_without_existing_vote(
  connection: api.IConnection,
) {
  /** 1. Author joins (authenticated context for content creation) */
  const authorEmail: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const authorAuth = await api.functional.auth.registeredMember.join(
    connection,
    {
      body: {
        email: authorEmail,
        username: RandomGenerator.alphabets(8),
        password: "P@ssw0rd_Auth1",
        displayName: RandomGenerator.name(1),
      } satisfies ICommunityPlatformRegisteredMember.IJoin,
    },
  );
  typia.assert(authorAuth);

  /** 2. Author creates a community */
  const communityName = `e2e-${RandomGenerator.alphaNumeric(12)}`;
  const community =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      {
        body: {
          name: communityName,
          category: "Tech & Programming",
          description: RandomGenerator.paragraph({ sentences: 10 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);
  TestValidator.equals(
    "community.name should equal requested communityName",
    community.name,
    communityName,
  );

  /** 3. Author creates a post in the community */
  const post =
    await api.functional.communityPlatform.registeredMember.posts.create(
      connection,
      {
        body: {
          communityName,
          title: RandomGenerator.paragraph({ sentences: 6 }),
          body: RandomGenerator.content({
            paragraphs: 1,
            sentenceMin: 12,
            sentenceMax: 20,
          }),
          authorDisplayName: RandomGenerator.name(1),
        } satisfies ICommunityPlatformPost.ICreate,
      },
    );
  typia.assert(post);
  TestValidator.equals(
    "post.community.name equals communityName",
    post.community.name,
    communityName,
  );

  /** 4. Author creates a comment under the post */
  const comment =
    await api.functional.communityPlatform.registeredMember.posts.comments.create(
      connection,
      {
        postId: post.id,
        body: {
          content: RandomGenerator.paragraph({ sentences: 12 }),
        } satisfies ICommunityPlatformComment.ICreate,
      },
    );
  typia.assert(comment);
  TestValidator.equals(
    "comment.postId equals post.id",
    comment.postId,
    post.id,
  );

  /** 5. Switch to Voter account (no prior vote on the comment) */
  const voterEmail: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const voterAuth = await api.functional.auth.registeredMember.join(
    connection,
    {
      body: {
        email: voterEmail,
        username: RandomGenerator.alphabets(8),
        password: "P@ssw0rd_Voter1",
        displayName: RandomGenerator.name(1),
      } satisfies ICommunityPlatformRegisteredMember.IJoin,
    },
  );
  typia.assert(voterAuth);

  /** 6. First DELETE: clearing a non-existent vote should succeed (no-op) */
  await api.functional.communityPlatform.registeredMember.comments.vote.erase(
    connection,
    { commentId: comment.id },
  );

  /** 7. Second DELETE (idempotency): should also succeed without error */
  await api.functional.communityPlatform.registeredMember.comments.vote.erase(
    connection,
    { commentId: comment.id },
  );

  // If we reached here without exceptions, idempotent no-op behavior is confirmed.
  TestValidator.predicate(
    "idempotent vote erase executed twice without errors",
    true,
  );
}
