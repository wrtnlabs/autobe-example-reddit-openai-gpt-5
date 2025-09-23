import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCategory";
import type { ICommunityPlatformComment } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformComment";
import type { ICommunityPlatformCommentVote } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommentVote";
import type { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformPost } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformPost";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";
import type { IECategorySortBy } from "@ORGANIZATION/PROJECT-api/lib/structures/IECategorySortBy";
import type { IECommunityPlatformCommentVoteState } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformCommentVoteState";
import type { IESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IESortDirection";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformCategory";

/**
 * Validate that a comment author cannot vote on their own comment.
 *
 * Steps:
 *
 * 1. Join and authenticate a community member (User A).
 * 2. Find an active category for community creation.
 * 3. Create a community under the selected category as User A.
 * 4. Create a post in that community as User A.
 * 5. Create a comment on that post as User A.
 * 6. Attempt to vote (Upvote) on the created comment as its author → must error.
 *
 * Business validations:
 *
 * - Category list returns at least one active category.
 * - The created comment's author id equals the joined user id.
 * - Self-vote attempt is rejected (error occurs). No status/message validation.
 */
export async function test_api_comment_vote_self_vote_forbidden(
  connection: api.IConnection,
) {
  // 1) Join & authenticate User A
  const joinBody = {
    username: RandomGenerator.name(1).replace(/\s+/g, ""),
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const authorized = await api.functional.auth.communityMember.join(
    connection,
    {
      body: joinBody,
    },
  );
  typia.assert(authorized);

  // 2) Find an active category
  const categoryReq = {
    page: 1,
    limit: 20,
    active: true,
    sortBy: "display_order",
    direction: "asc",
  } satisfies ICommunityPlatformCategory.IRequest;
  const categories = await api.functional.communityPlatform.categories.index(
    connection,
    { body: categoryReq },
  );
  typia.assert(categories);
  TestValidator.predicate(
    "at least one active category exists",
    categories.data.length > 0,
  );
  const category = categories.data[0];

  // 3) Create a community
  const communityBody = {
    name: `c${RandomGenerator.alphaNumeric(10)}`,
    community_platform_category_id: category.id,
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      { body: communityBody },
    );
  typia.assert(community);
  TestValidator.equals(
    "community uses selected category",
    community.community_platform_category_id,
    category.id,
  );

  // 4) Create a post in the community
  const postBody = {
    title: RandomGenerator.paragraph({ sentences: 5 }),
    body: RandomGenerator.content({
      paragraphs: 1,
      sentenceMin: 10,
      sentenceMax: 15,
    }),
  } satisfies ICommunityPlatformPost.ICreate;
  const post =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      { communityId: community.id, body: postBody },
    );
  typia.assert(post);

  // 5) Create a comment on the post (as User A)
  const commentBody = {
    content: RandomGenerator.paragraph({ sentences: 10 }),
  } satisfies ICommunityPlatformComment.ICreate;
  const comment =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      connection,
      { postId: post.id, body: commentBody },
    );
  typia.assert(comment);
  TestValidator.equals(
    "comment authored by the joined user",
    comment.community_platform_user_id,
    authorized.id,
  );

  // 6) Attempt to self-vote → must be rejected
  await TestValidator.error("author cannot vote on own comment", async () => {
    await api.functional.communityPlatform.communityMember.comments.votes.update(
      connection,
      {
        commentId: comment.id,
        body: {
          state: "Upvote",
        } satisfies ICommunityPlatformCommentVote.IUpdate,
      },
    );
  });
}
