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
 * Confirm unauthenticated users cannot vote on comments.
 *
 * Business context:
 *
 * - Comment voting is restricted to authenticated community members.
 * - This test prepares minimal content (community → post → comment) using an
 *   authenticated context, then attempts the vote action without any auth
 *   header.
 *
 * Steps:
 *
 * 1. Join as a community member (User A)
 * 2. Find an active category (or any category as fallback)
 * 3. Create a community under the category
 * 4. Create a post in that community
 * 5. Create a comment on that post
 * 6. Attempt to vote on the comment using an unauthenticated connection and
 *    validate the request fails
 */
export async function test_api_comment_vote_unauthorized_when_not_authenticated(
  connection: api.IConnection,
) {
  // 1) Authenticate (User A) for setup
  const joinBody = {
    username: `user_${RandomGenerator.alphaNumeric(8)}`,
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const authorized: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(connection, {
      body: joinBody,
    });
  typia.assert(authorized);

  // 2) Find an active category (fallback to any if none active)
  const catPageActive: IPageICommunityPlatformCategory.ISummary =
    await api.functional.communityPlatform.categories.index(connection, {
      body: {
        page: 1,
        limit: 1,
        active: true,
        sortBy: "display_order",
        direction: "asc",
      } satisfies ICommunityPlatformCategory.IRequest,
    });
  typia.assert(catPageActive);

  let category: ICommunityPlatformCategory.ISummary;
  if (catPageActive.data.length > 0) category = catPageActive.data[0];
  else {
    const catPageAny: IPageICommunityPlatformCategory.ISummary =
      await api.functional.communityPlatform.categories.index(connection, {
        body: {
          page: 1,
          limit: 1,
        } satisfies ICommunityPlatformCategory.IRequest,
      });
    typia.assert(catPageAny);
    TestValidator.predicate(
      "at least one category must exist for setup",
      catPageAny.data.length > 0,
    );
    category = catPageAny.data[0];
  }

  // 3) Create a community
  const communityName = (() => {
    // Ensure: starts with a letter, contains only [A-Za-z0-9_-], length 3-32, ends with alnum
    const first = RandomGenerator.alphabets(1); // letter
    const middle = RandomGenerator.alphaNumeric(8); // letters/digits
    const last = RandomGenerator.alphaNumeric(1); // alnum
    return `${first}${middle}${last}`; // length 10
  })();
  const communityBody = {
    name: communityName,
    community_platform_category_id: category.id,
    description: RandomGenerator.paragraph({ sentences: 6 }),
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community: ICommunityPlatformCommunity =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      { body: communityBody },
    );
  typia.assert(community);
  TestValidator.equals(
    "community linked to selected category",
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
      wordMin: 3,
      wordMax: 8,
    }),
  } satisfies ICommunityPlatformPost.ICreate;
  const post: ICommunityPlatformPost =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      {
        communityId: community.id,
        body: postBody,
      },
    );
  typia.assert(post);
  TestValidator.equals(
    "post belongs to the community",
    post.community_platform_community_id,
    community.id,
  );

  // 5) Create a comment on the post
  const commentBody = {
    content: RandomGenerator.paragraph({ sentences: 6 }),
  } satisfies ICommunityPlatformComment.ICreate;
  const comment: ICommunityPlatformComment =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      connection,
      {
        postId: post.id,
        body: commentBody,
      },
    );
  typia.assert(comment);
  TestValidator.equals(
    "comment belongs to the post",
    comment.community_platform_post_id,
    post.id,
  );

  // 6) Attempt to vote without authentication
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "unauthenticated access to comment vote endpoint must fail",
    async () => {
      await api.functional.communityPlatform.communityMember.comments.votes.update(
        unauthConn,
        {
          commentId: comment.id,
          body: {
            state: "Upvote",
          } satisfies ICommunityPlatformCommentVote.IUpdate,
        },
      );
    },
  );
}
