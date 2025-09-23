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
 * Validate vote upsert/toggle behavior for a non-author user on a post.
 *
 * Steps:
 *
 * 1. Author A joins → creates a community → creates a post
 * 2. Switch to Member B by joining (SDK auto-switches Authorization)
 * 3. Member B votes up → repeat up (idempotent) → down
 *
 * Validations:
 *
 * - State reflects exact lowercase values ("up"|"down")
 * - Idempotent up keeps state and preserves vote id
 * - Switching to down preserves the same vote id (one active vote per pair)
 * - Referential integrity: vote.user == B, vote.post == created post
 */
export async function test_api_post_vote_toggle_by_non_author(
  connection: api.IConnection,
) {
  // 1) Register Author A
  const authorJoin = await api.functional.auth.communityMember.join(
    connection,
    {
      body: {
        username: `user_${RandomGenerator.alphaNumeric(8)}`,
        email: typia.random<string & tags.Format<"email">>(),
        password: RandomGenerator.alphaNumeric(12),
      } satisfies ICommunityPlatformCommunityMember.ICreate,
    },
  );
  typia.assert(authorJoin);

  // 2) List categories and pick one (require at least one)
  const categoryReq = {} satisfies ICommunityPlatformCategory.IRequest;
  const categories = await api.functional.communityPlatform.categories.index(
    connection,
    { body: categoryReq },
  );
  typia.assert(categories);
  TestValidator.predicate(
    "at least one category exists",
    categories.data.length > 0,
  );
  const category = categories.data[0];

  // 3) Create a community as Author A
  // Name must: start with letter, allow [A-Za-z0-9_-], end alphanumeric, len 3-32
  const alnum = [..."abcdefghijklmnopqrstuvwxyz0123456789"] as const;
  const tail = RandomGenerator.pick(alnum);
  const communityName = `c${RandomGenerator.alphabets(6)}${tail}`;
  const community =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      {
        body: {
          name: communityName,
          community_platform_category_id: category.id,
          description: RandomGenerator.paragraph({ sentences: 8 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);

  // 4) Create a post within the community as Author A
  const post =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      {
        communityId: community.id,
        body: {
          title: RandomGenerator.paragraph({ sentences: 5 }),
          body: RandomGenerator.content({
            paragraphs: 2,
            sentenceMin: 10,
            sentenceMax: 20,
          }),
        } satisfies ICommunityPlatformPost.ICreate,
      },
    );
  typia.assert(post);

  // 5) Switch actor: Member B joins (SDK auto-switches Authorization)
  const memberB = await api.functional.auth.communityMember.join(connection, {
    body: {
      username: `user_${RandomGenerator.alphaNumeric(8)}`,
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ICommunityPlatformCommunityMember.ICreate,
  });
  typia.assert(memberB);
  TestValidator.notEquals(
    "author and voter must be different users",
    authorJoin.id,
    memberB.id,
  );

  // Reusable bodies for vote updates
  const upBody = { state: "up" } satisfies ICommunityPlatformPostVote.IUpdate;
  const downBody = {
    state: "down",
  } satisfies ICommunityPlatformPostVote.IUpdate;

  // 6) Member B votes "up"
  const upVote =
    await api.functional.communityPlatform.communityMember.posts.votes.update(
      connection,
      { postId: post.id, body: upBody },
    );
  typia.assert(upVote);
  TestValidator.equals("first upvote returns state=up", upVote.state, "up");
  TestValidator.equals(
    "upvote targets the correct post",
    upVote.community_platform_post_id,
    post.id,
  );
  TestValidator.equals(
    "upvote belongs to Member B",
    upVote.community_platform_user_id,
    memberB.id,
  );

  // 7) Repeat "up" (idempotent)
  const upVoteAgain =
    await api.functional.communityPlatform.communityMember.posts.votes.update(
      connection,
      { postId: post.id, body: upBody },
    );
  typia.assert(upVoteAgain);
  TestValidator.equals("idempotent up keeps state=up", upVoteAgain.state, "up");
  TestValidator.equals(
    "idempotent up keeps same vote id",
    upVoteAgain.id,
    upVote.id,
  );

  // 8) Switch to "down"
  const downVote =
    await api.functional.communityPlatform.communityMember.posts.votes.update(
      connection,
      { postId: post.id, body: downBody },
    );
  typia.assert(downVote);
  TestValidator.equals(
    "switching to down returns state=down",
    downVote.state,
    "down",
  );
  TestValidator.equals(
    "vote id remains the same across toggles",
    downVote.id,
    upVote.id,
  );
  TestValidator.equals(
    "downvote targets the correct post",
    downVote.community_platform_post_id,
    post.id,
  );
  TestValidator.equals(
    "downvote belongs to Member B",
    downVote.community_platform_user_id,
    memberB.id,
  );
}
