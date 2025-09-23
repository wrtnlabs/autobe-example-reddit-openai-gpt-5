import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformPost } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformPost";
import type { ICommunityPlatformPostVote } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformPostVote";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";
import type { IEPostVoteState } from "@ORGANIZATION/PROJECT-api/lib/structures/IEPostVoteState";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformPost } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformPost";

/**
 * Validate community feed listing sorts (Newest, Top), deterministic
 * tiebreakers, and exclusion of deleted posts. Also verify listing is publicly
 * accessible.
 *
 * Workflow:
 *
 * 1. UserA joins (author)
 * 2. UserA creates a community
 * 3. UserA creates multiple posts (A, B, C) and another post to delete (D)
 * 4. UserA deletes post D
 * 5. UserB joins (non-author)
 * 6. UserB votes: up on A, down on B (C remains unvoted)
 * 7. List with sort=newest and sort=top; validate order and deletion exclusion
 * 8. Create two zero-score posts to validate Top tiebreaker (newer ranks earlier)
 * 9. Verify public access by calling listing with an unauthenticated connection
 */
export async function test_api_community_posts_feed_sort_newest_and_top(
  connection: api.IConnection,
) {
  // helper: generate valid community name (3-32 chars, starts with letter, ends alnum)
  const generateCommunityName = (): string => {
    const letters = [
      ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
    ] as const;
    const pool = [
      ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_",
    ] as const;
    const tailPool = [
      ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
    ] as const;
    const len = 10; // within 3-32
    const first = RandomGenerator.pick(letters);
    let mid = "";
    for (let i = 0; i < len - 2; i++) mid += RandomGenerator.pick(pool);
    const last = RandomGenerator.pick(tailPool);
    return `${first}${mid}${last}`;
  };

  // 1) UserA joins
  const userA = await api.functional.auth.communityMember.join(connection, {
    body: {
      username: `userA_${RandomGenerator.alphaNumeric(8)}`,
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ICommunityPlatformCommunityMember.ICreate,
  });
  typia.assert(userA);

  // 2) Create community as UserA
  const community =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      {
        body: {
          name: generateCommunityName(),
          community_platform_category_id: typia.random<
            string & tags.Format<"uuid">
          >(),
          description: RandomGenerator.paragraph({ sentences: 8 }),
          logo: null,
          banner: null,
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);

  // helper to create a post body
  const makePostBody = () =>
    ({
      title: RandomGenerator.paragraph({ sentences: 6 }),
      body: RandomGenerator.content({
        paragraphs: 1,
        sentenceMin: 12,
        sentenceMax: 20,
        wordMin: 3,
        wordMax: 8,
      }),
      author_display_name: RandomGenerator.name(1),
    }) satisfies ICommunityPlatformPost.ICreate;

  // 3) Create posts A, B, C and D (to delete)
  const postA =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      { communityId: community.id, body: makePostBody() },
    );
  typia.assert(postA);
  const postB =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      { communityId: community.id, body: makePostBody() },
    );
  typia.assert(postB);
  const postC =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      { communityId: community.id, body: makePostBody() },
    );
  typia.assert(postC);
  const postToDelete =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      { communityId: community.id, body: makePostBody() },
    );
  typia.assert(postToDelete);

  // 4) Delete one post (D)
  await api.functional.communityPlatform.communityMember.posts.erase(
    connection,
    {
      postId: postToDelete.id,
    },
  );

  // 5) UserB joins
  const userB = await api.functional.auth.communityMember.join(connection, {
    body: {
      username: `userB_${RandomGenerator.alphaNumeric(8)}`,
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ICommunityPlatformCommunityMember.ICreate,
  });
  typia.assert(userB);

  // 6) UserB votes: up on A, down on B (C remains unvoted)
  const voteUpA =
    await api.functional.communityPlatform.communityMember.posts.votes.update(
      connection,
      {
        postId: postA.id,
        body: { state: "up" } satisfies ICommunityPlatformPostVote.IUpdate,
      },
    );
  typia.assert(voteUpA);
  const voteDownB =
    await api.functional.communityPlatform.communityMember.posts.votes.update(
      connection,
      {
        postId: postB.id,
        body: { state: "down" } satisfies ICommunityPlatformPostVote.IUpdate,
      },
    );
  typia.assert(voteDownB);

  // 7) List with sort=newest
  const newestPage =
    await api.functional.communityPlatform.communities.posts.index(connection, {
      communityId: community.id,
      body: {
        sort: "newest",
        limit: 50 satisfies number as number,
      } satisfies ICommunityPlatformPost.IRequest,
    });
  typia.assert(newestPage);
  const newest = newestPage.data;

  // Deleted post excluded
  TestValidator.predicate(
    "deleted post should not appear in newest listing",
    newest.every((s) => s.id !== postToDelete.id),
  );
  // All active posts present
  TestValidator.predicate(
    "active posts A, B, C appear in newest listing",
    newest.some((s) => s.id === postA.id) &&
      newest.some((s) => s.id === postB.id) &&
      newest.some((s) => s.id === postC.id),
  );
  // created_at DESC ordering
  const isNewestDesc = newest.every(
    (cur, idx, arr) => idx === 0 || arr[idx - 1].created_at >= cur.created_at,
  );
  TestValidator.predicate(
    "newest feed is ordered by created_at descending",
    isNewestDesc,
  );

  // 7) List with sort=top
  const topPage =
    await api.functional.communityPlatform.communities.posts.index(connection, {
      communityId: community.id,
      body: {
        sort: "top",
        limit: 50 satisfies number as number,
      } satisfies ICommunityPlatformPost.IRequest,
    });
  typia.assert(topPage);
  const top = topPage.data;

  // Deleted post excluded in top
  TestValidator.predicate(
    "deleted post should not appear in top listing",
    top.every((s) => s.id !== postToDelete.id),
  );
  const idxA = top.findIndex((s) => s.id === postA.id);
  const idxB = top.findIndex((s) => s.id === postB.id);
  const idxC = top.findIndex((s) => s.id === postC.id);
  TestValidator.predicate("upvoted post is present in top feed", idxA >= 0);
  TestValidator.predicate("downvoted post is present in top feed", idxB >= 0);
  TestValidator.predicate("unvoted post is present in top feed", idxC >= 0);
  TestValidator.predicate(
    "upvoted post ranks higher than unvoted",
    idxA >= 0 && idxC >= 0 && idxA < idxC,
  );
  TestValidator.predicate(
    "unvoted ranks higher than downvoted",
    idxC >= 0 && idxB >= 0 && idxC < idxB,
  );

  // 8) Create two additional zero-score posts to check Top tiebreaker
  const zero1 =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      { communityId: community.id, body: makePostBody() },
    );
  typia.assert(zero1);
  const zero2 =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      { communityId: community.id, body: makePostBody() },
    );
  typia.assert(zero2);

  const topAfterZerosPage =
    await api.functional.communityPlatform.communities.posts.index(connection, {
      communityId: community.id,
      body: {
        sort: "top",
        limit: 50 satisfies number as number,
      } satisfies ICommunityPlatformPost.IRequest,
    });
  typia.assert(topAfterZerosPage);
  const topAfterZeros = topAfterZerosPage.data;
  const z1Idx = topAfterZeros.findIndex((s) => s.id === zero1.id);
  const z2Idx = topAfterZeros.findIndex((s) => s.id === zero2.id);
  const z1 = topAfterZeros.find((s) => s.id === zero1.id);
  const z2 = topAfterZeros.find((s) => s.id === zero2.id);
  if (z1 && z2) {
    // newer created_at should rank earlier among equal scores
    if (z2.created_at >= z1.created_at)
      TestValidator.predicate(
        "top tiebreaker prefers newer zero-score post (zero2 before zero1)",
        z2Idx >= 0 && z1Idx >= 0 && z2Idx < z1Idx,
      );
    else
      TestValidator.predicate(
        "top tiebreaker prefers newer zero-score post (zero1 before zero2)",
        z2Idx >= 0 && z1Idx >= 0 && z1Idx < z2Idx,
      );
  }

  // 9) Public access: unauthenticated listing works
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  const publicPage =
    await api.functional.communityPlatform.communities.posts.index(unauthConn, {
      communityId: community.id,
      body: {
        sort: "newest",
        limit: 50 satisfies number as number,
      } satisfies ICommunityPlatformPost.IRequest,
    });
  typia.assert(publicPage);
  TestValidator.predicate(
    "public listing returns created posts without auth",
    publicPage.data.some((s) => s.id === postA.id),
  );
}
