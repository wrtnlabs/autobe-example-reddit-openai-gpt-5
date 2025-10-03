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
import type { IEVoteState } from "@ORGANIZATION/PROJECT-api/lib/structures/IEVoteState";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformComment } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformComment";

/**
 * Validate minimum query length enforcement and search visibility rules for
 * comments.
 *
 * Business purpose:
 *
 * - Ensure comment search rejects too-short queries (q < 2 characters).
 * - Verify search excludes soft-deleted comments.
 * - Verify search excludes comments when their parent post has been deleted.
 *
 * Test flow:
 *
 * 1. Authenticate by joining as a registered member.
 * 2. Create a community with a valid name and category.
 * 3. Create a text post under the community.
 * 4. Create two comments embedding unique tokens tokenA and tokenB.
 * 5. Short-query guard: call search with q of length 1 and expect an error.
 * 6. Soft-delete the comment with tokenA and verify search for tokenA no longer
 *    returns it.
 * 7. Verify search for tokenB returns the comment while the post is active.
 * 8. Delete the parent post and verify search for tokenB no longer returns it.
 */
export async function test_api_comments_search_min_length_enforced_and_visibility_rules(
  connection: api.IConnection,
) {
  // 1) Authenticate as a registered member
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    username: `user_${RandomGenerator.alphaNumeric(10)}`,
    password: `P@ssw0rd_${RandomGenerator.alphaNumeric(8)}`,
    displayName: RandomGenerator.name(2),
    client: {
      userAgent: "e2e-tests",
      sessionType: "standard",
    },
  } satisfies ICommunityPlatformRegisteredMember.IJoin;
  const me = await api.functional.auth.registeredMember.join(connection, {
    body: joinBody,
  });
  typia.assert(me);

  // 2) Create a community
  const communityName = `e2e_${RandomGenerator.alphaNumeric(6)}${RandomGenerator.alphabets(1)}`; // starts with alpha-num, ends with alpha
  const communityBody = {
    name: communityName,
    category: "Tech & Programming" as IECommunityCategory,
    description: RandomGenerator.paragraph({ sentences: 6 }),
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      { body: communityBody },
    );
  typia.assert(community);

  // 3) Create a post in the community
  const postBody = {
    communityName: communityName,
    title: RandomGenerator.paragraph({ sentences: 5 }),
    body: RandomGenerator.content({
      paragraphs: 1,
      sentenceMin: 10,
      sentenceMax: 20,
    }),
    authorDisplayName: RandomGenerator.name(2),
  } satisfies ICommunityPlatformPost.ICreate;
  const post =
    await api.functional.communityPlatform.registeredMember.posts.create(
      connection,
      { body: postBody },
    );
  typia.assert(post);

  // 4) Create two comments with unique tokens
  const tokenA = `tokA_${RandomGenerator.alphaNumeric(10)}`;
  const tokenB = `tokB_${RandomGenerator.alphaNumeric(10)}`;

  const commentA =
    await api.functional.communityPlatform.registeredMember.posts.comments.create(
      connection,
      {
        postId: post.id,
        body: {
          content: `Comment A with unique token ${tokenA}.`,
        } satisfies ICommunityPlatformComment.ICreate,
      },
    );
  typia.assert(commentA);

  const commentB =
    await api.functional.communityPlatform.registeredMember.posts.comments.create(
      connection,
      {
        postId: post.id,
        body: {
          content: `Comment B holding ${tokenB} to be searched.`,
        } satisfies ICommunityPlatformComment.ICreate,
      },
    );
  typia.assert(commentB);

  // 5) Short-query guard: 1-character q should fail
  const shortQ = "x" satisfies string as string; // aid type compatibility for tagged string
  await TestValidator.error(
    "short query (length 1) should be rejected",
    async () => {
      await api.functional.communityPlatform.search.comments.index(connection, {
        body: {
          q: shortQ,
          limit: 20,
        } satisfies ICommunityPlatformComment.IRequest,
      });
    },
  );

  // Helper to execute a search with q
  const searchBy = async (q: string) =>
    await api.functional.communityPlatform.search.comments.index(connection, {
      body: { q, limit: 20 } satisfies ICommunityPlatformComment.IRequest,
    });

  // 6) Soft-delete commentA then ensure it no longer appears
  await api.functional.communityPlatform.registeredMember.comments.erase(
    connection,
    {
      commentId: commentA.id,
    },
  );

  const pageA = await searchBy(tokenA);
  typia.assert(pageA);
  const containsDeleted = pageA.data.some((c) => c.id === commentA.id);
  TestValidator.predicate(
    "deleted commentA should be excluded from search results",
    containsDeleted === false,
  );

  // 7) tokenB should be present before post deletion
  const pageB1 = await searchBy(tokenB);
  typia.assert(pageB1);
  const foundBBefore = pageB1.data.some((c) => c.id === commentB.id);
  TestValidator.predicate(
    "commentB should be discoverable before deleting its parent post",
    foundBBefore === true,
  );

  // 8) Delete the parent post; tokenB should no longer be discoverable
  await api.functional.communityPlatform.registeredMember.posts.erase(
    connection,
    {
      postId: post.id,
    },
  );

  const pageB2 = await searchBy(tokenB);
  typia.assert(pageB2);
  const foundBAfter = pageB2.data.some((c) => c.id === commentB.id);
  TestValidator.predicate(
    "comments under a deleted post should be excluded from search results",
    foundBAfter === false,
  );
}
