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

export async function test_api_post_vote_self_vote_denied(
  connection: api.IConnection,
) {
  /**
   * Validate that a post author cannot vote on their own post.
   *
   * Steps:
   *
   * 1. Join as a community member (Author A).
   * 2. Discover an active category (fallback to any if none returned).
   * 3. Create a community under the discovered category.
   * 4. Create a post in that community.
   * 5. Attempt to upvote the post as its author and expect an error (self-vote
   *    denied).
   *
   * Notes:
   *
   * - Do not assert HTTP status codes or error messages; only assert that an
   *   error occurs.
   * - Use precise DTO variants for each operation and typia.assert on non-void
   *   responses.
   */

  // 1) Join as community member (Author A)
  const username: string = `user_${RandomGenerator.alphaNumeric(10)}`;
  const email: string = typia.random<string & tags.Format<"email">>();
  const password: string = RandomGenerator.alphaNumeric(12); // >= 8 chars as required

  const author = await api.functional.auth.communityMember.join(connection, {
    body: {
      username,
      email,
      password,
    } satisfies ICommunityPlatformCommunityMember.ICreate,
  });
  typia.assert(author);

  // 2) Discover an active category (pre-existing)
  const catPageActive = await api.functional.communityPlatform.categories.index(
    connection,
    {
      body: {
        active: true,
        limit: 10,
      } satisfies ICommunityPlatformCategory.IRequest,
    },
  );
  typia.assert(catPageActive);

  const category =
    catPageActive.data.length > 0
      ? catPageActive.data[0]
      : (
          await api.functional.communityPlatform.categories.index(connection, {
            body: {
              active: null,
              limit: 10,
            } satisfies ICommunityPlatformCategory.IRequest,
          })
        ).data[0];

  // Ensure we have at least one category to proceed
  await TestValidator.predicate(
    "a category must be available to create a community",
    async () => category !== undefined,
  );

  // 3) Create a community
  const communityName = `c${RandomGenerator.alphaNumeric(10)}`; // starts with a letter, length 11
  const community =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      {
        body: {
          name: communityName,
          community_platform_category_id: category!.id,
          description: RandomGenerator.paragraph({ sentences: 8 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);

  // 4) Create a post in that community
  const post =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      {
        communityId: community.id,
        body: {
          title: RandomGenerator.paragraph({ sentences: 5 }),
          body: RandomGenerator.content({
            paragraphs: 2,
            sentenceMin: 8,
            sentenceMax: 15,
          }),
        } satisfies ICommunityPlatformPost.ICreate,
      },
    );
  typia.assert(post);

  // 5) Attempt to upvote the post as its author and expect an error
  await TestValidator.error(
    "author cannot vote on their own post",
    async () => {
      await api.functional.communityPlatform.communityMember.posts.votes.update(
        connection,
        {
          postId: post.id,
          body: {
            state: "up",
          } satisfies ICommunityPlatformPostVote.IUpdate,
        },
      );
    },
  );
}
