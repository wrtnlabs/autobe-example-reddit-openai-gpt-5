import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCategory";
import type { ICommunityPlatformComment } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformComment";
import type { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformPost } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformPost";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";
import type { IECategorySortBy } from "@ORGANIZATION/PROJECT-api/lib/structures/IECategorySortBy";
import type { IESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IESortDirection";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformCategory";

/**
 * Verify unauthenticated users cannot clear a vote on a comment.
 *
 * Business context:
 *
 * - Clearing a vote on a comment is a privileged action requiring authentication.
 * - This test prepares a valid comment through authenticated flows, then calls
 *   the vote-clear endpoint without authentication to ensure it is rejected.
 *
 * Steps:
 *
 * 1. Join as a community member (User A).
 * 2. Retrieve categories and pick an active category for community creation.
 * 3. Create a community, then a post in that community, then a comment on the
 *    post.
 * 4. Create an unauthenticated connection and attempt to erase a vote → expect
 *    error.
 * 5. Optionally, call authorized erase to ensure normal behavior (void response)
 *    and resource integrity.
 */
export async function test_api_comment_vote_clear_unauthorized_when_not_authenticated(
  connection: api.IConnection,
) {
  // 1) Authenticate (User A) for setup
  const memberA = await api.functional.auth.communityMember.join(connection, {
    body: {
      username: RandomGenerator.name(1).replace(/\s+/g, "-"),
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ICommunityPlatformCommunityMember.ICreate,
  });
  typia.assert(memberA);

  // 2) Retrieve categories and find an active one
  const categoriesPage =
    await api.functional.communityPlatform.categories.index(connection, {
      body: {
        active: true,
        limit: 20,
        sortBy: "display_order",
        direction: "asc",
      } satisfies ICommunityPlatformCategory.IRequest,
    });
  typia.assert(categoriesPage);
  if (categoriesPage.data.length === 0)
    throw new Error("No categories available to create a community.");
  const category =
    categoriesPage.data.find((c) => c.active) ?? categoriesPage.data[0];

  // 3) Create a community → ensure name format [letter][A-Za-z0-9_-]{1,30}[A-Za-z0-9]
  const communityName = `${RandomGenerator.alphabets(1)}${RandomGenerator.alphaNumeric(9)}`; // 10 chars, starts with letter, ends alnum
  const community =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      {
        body: {
          name: communityName,
          community_platform_category_id: category.id,
          description: RandomGenerator.paragraph({ sentences: 8 }),
          logo: null,
          banner: null,
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);

  // Create a post under the community
  const post =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      {
        communityId: community.id,
        body: {
          title: RandomGenerator.paragraph({ sentences: 5 }),
          body: RandomGenerator.content({
            paragraphs: 1,
            sentenceMin: 10,
            sentenceMax: 20,
            wordMin: 3,
            wordMax: 8,
          }),
          author_display_name: RandomGenerator.name(1),
        } satisfies ICommunityPlatformPost.ICreate,
      },
    );
  typia.assert(post);
  TestValidator.equals(
    "post belongs to community",
    post.community_platform_community_id,
    community.id,
  );

  // Create a comment on the post
  const comment =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      connection,
      {
        postId: post.id,
        body: {
          content: RandomGenerator.paragraph({ sentences: 10 }),
          parent_id: null,
        } satisfies ICommunityPlatformComment.ICreate,
      },
    );
  typia.assert(comment);
  TestValidator.equals(
    "comment belongs to post",
    comment.community_platform_post_id,
    post.id,
  );

  // 4) Build unauthenticated connection and attempt to erase vote → expect error
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "unauthenticated user cannot clear comment vote",
    async () => {
      await api.functional.communityPlatform.communityMember.comments.votes.erase(
        unauthConn,
        {
          commentId: comment.id,
        },
      );
    },
  );

  // 5) Optional: Authorized call succeeds (idempotent), verify no exception (void response)
  await api.functional.communityPlatform.communityMember.comments.votes.erase(
    connection,
    {
      commentId: comment.id,
    },
  );
}
