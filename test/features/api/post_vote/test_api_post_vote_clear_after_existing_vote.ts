import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCategory";
import type { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformPost } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformPost";
import type { ICommunityPlatformPostVote } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformPostVote";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";
import type { IECategorySortBy } from "@ORGANIZATION/PROJECT-api/lib/structures/IECategorySortBy";
import type { IEPostVoteState } from "@ORGANIZATION/PROJECT-api/lib/structures/IEPostVoteState";
import type { IESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IESortDirection";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformCategory";

/**
 * Clear an existing post vote and validate idempotency.
 *
 * This test verifies that when a community member clears their vote on a post,
 * the active vote record is removed (state becomes None), and repeating the
 * clear operation is idempotent (no error on repeated DELETE).
 *
 * Steps:
 *
 * 1. Join as Author A and fetch an active category.
 * 2. Create a community and then a post as Author A.
 * 3. Join as Member B (actor switch) and set vote state to "up".
 * 4. DELETE the vote once (expect success).
 * 5. DELETE the vote again (idempotent, still success).
 * 6. Re-set a vote (e.g., "down") to ensure a new vote can be established after
 *    clearing.
 */
export async function test_api_post_vote_clear_after_existing_vote(
  connection: api.IConnection,
) {
  // 1) Join as Author A
  const authorJoin = await api.functional.auth.communityMember.join(
    connection,
    {
      body: {
        username: `author_${RandomGenerator.alphabets(8)}`,
        email: typia.random<string & tags.Format<"email">>(),
        password: RandomGenerator.alphaNumeric(12),
      } satisfies ICommunityPlatformCommunityMember.ICreate,
    },
  );
  typia.assert(authorJoin);

  // 2) Discover an active category to use for community creation
  const categoryPage = await api.functional.communityPlatform.categories.index(
    connection,
    {
      body: {
        active: true,
        limit: 20,
      } satisfies ICommunityPlatformCategory.IRequest,
    },
  );
  typia.assert(categoryPage);
  const category = categoryPage.data[0];
  typia.assertGuard<ICommunityPlatformCategory.ISummary>(category!);

  // 3) Create a community
  const communityReq = {
    name: `c${RandomGenerator.alphaNumeric(12)}`,
    community_platform_category_id: category.id,
    description: RandomGenerator.paragraph({ sentences: 8 }),
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      { body: communityReq },
    );
  typia.assert(community);

  // 4) Create a post within the community
  const postReq = {
    title: RandomGenerator.paragraph({ sentences: 5 }),
    body: RandomGenerator.content({
      paragraphs: 2,
      sentenceMin: 5,
      sentenceMax: 10,
    }),
    author_display_name: RandomGenerator.name(1),
  } satisfies ICommunityPlatformPost.ICreate;
  const post =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      {
        communityId: community.id,
        body: postReq,
      },
    );
  typia.assert(post);

  // 5) Switch actor: Join as Member B and set initial vote to "up"
  const memberB = await api.functional.auth.communityMember.join(connection, {
    body: {
      username: `member_${RandomGenerator.alphabets(8)}`,
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ICommunityPlatformCommunityMember.ICreate,
  });
  typia.assert(memberB);

  const upVote =
    await api.functional.communityPlatform.communityMember.posts.votes.update(
      connection,
      {
        postId: post.id,
        body: { state: "up" } satisfies ICommunityPlatformPostVote.IUpdate,
      },
    );
  typia.assert(upVote);
  TestValidator.equals(
    "vote is bound to target post",
    upVote.community_platform_post_id,
    post.id,
  );
  TestValidator.equals(
    "vote owner is Member B",
    upVote.community_platform_user_id,
    memberB.id,
  );
  TestValidator.equals("vote state is up", upVote.state, "up");

  // 6) Clear the vote and validate idempotency by repeating
  await api.functional.communityPlatform.communityMember.posts.votes.erase(
    connection,
    { postId: post.id },
  );
  // Second DELETE should also succeed (idempotent)
  await api.functional.communityPlatform.communityMember.posts.votes.erase(
    connection,
    { postId: post.id },
  );

  // 7) Re-set a vote after clearing to ensure system allows new vote creation
  const downVote =
    await api.functional.communityPlatform.communityMember.posts.votes.update(
      connection,
      {
        postId: post.id,
        body: { state: "down" } satisfies ICommunityPlatformPostVote.IUpdate,
      },
    );
  typia.assert(downVote);
  TestValidator.equals(
    "re-established vote is bound to target post",
    downVote.community_platform_post_id,
    post.id,
  );
  TestValidator.equals(
    "re-established vote owner is Member B",
    downVote.community_platform_user_id,
    memberB.id,
  );
  TestValidator.equals(
    "re-established vote state is down",
    downVote.state,
    "down",
  );
}
