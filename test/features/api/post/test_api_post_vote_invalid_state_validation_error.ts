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

export async function test_api_post_vote_invalid_state_validation_error(
  connection: api.IConnection,
) {
  // 1) Join as Author A
  const authorJoinBody =
    typia.random<ICommunityPlatformCommunityMember.ICreate>();
  const authorAuth = await api.functional.auth.communityMember.join(
    connection,
    {
      body: authorJoinBody,
    },
  );
  typia.assert(authorAuth);

  // 2) Discover an active category
  const categoryPage = await api.functional.communityPlatform.categories.index(
    connection,
    {
      body: { active: true } satisfies ICommunityPlatformCategory.IRequest,
    },
  );
  typia.assert(categoryPage);
  const selectedCategory =
    categoryPage.data.find((c) => c.active) ?? categoryPage.data[0];
  typia.assertGuard(selectedCategory!);

  // 3) Create a community under the selected category
  const communityName = `c${RandomGenerator.alphaNumeric(11)}`; // starts with letter, 12 chars total
  const communityBody = {
    name: communityName,
    community_platform_category_id: selectedCategory.id,
    description: RandomGenerator.paragraph({ sentences: 8 }),
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      { body: communityBody },
    );
  typia.assert(community);
  TestValidator.equals(
    "community category matches selection",
    community.community_platform_category_id,
    selectedCategory.id,
  );

  // 4) Author A creates a post in the community
  const postBody = {
    title: RandomGenerator.paragraph({ sentences: 5 }),
    body: RandomGenerator.content({
      paragraphs: 1,
      sentenceMin: 10,
      sentenceMax: 20,
    }),
  } satisfies ICommunityPlatformPost.ICreate;
  const post =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      {
        communityId: community.id,
        body: postBody,
      },
    );
  typia.assert(post);
  TestValidator.equals(
    "post linked to the community",
    post.community_platform_community_id,
    community.id,
  );

  // 5) Negative case: author cannot vote on own post
  await TestValidator.error("author cannot vote on own post", async () => {
    await api.functional.communityPlatform.communityMember.posts.votes.update(
      connection,
      {
        postId: post.id,
        body: { state: "up" } satisfies ICommunityPlatformPostVote.IUpdate,
      },
    );
  });

  // 6) Switch actor: Join as Member B
  const memberJoinBody =
    typia.random<ICommunityPlatformCommunityMember.ICreate>();
  const memberAuth = await api.functional.auth.communityMember.join(
    connection,
    {
      body: memberJoinBody,
    },
  );
  typia.assert(memberAuth);

  // 7) Member B votes "up"
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
    "vote targets the correct post (up)",
    upVote.community_platform_post_id,
    post.id,
  );
  TestValidator.equals(
    "vote created by Member B (up)",
    upVote.community_platform_user_id,
    memberAuth.id,
  );
  TestValidator.equals("vote state is up", upVote.state, "up");

  // 8) Member B changes vote to "down"
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
    "vote targets the correct post (down)",
    downVote.community_platform_post_id,
    post.id,
  );
  TestValidator.equals(
    "vote created by Member B (down)",
    downVote.community_platform_user_id,
    memberAuth.id,
  );
  TestValidator.equals("vote state is down", downVote.state, "down");
}
