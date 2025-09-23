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
 * Verify an authenticated user can create a reply under an existing parent
 * comment.
 *
 * Workflow:
 *
 * 1. Join as a community member (User A) to obtain authentication.
 * 2. Discover active categories and pick one for community creation.
 * 3. Create a community owned by User A.
 * 4. Create a post under the community.
 * 5. Create a parent top-level comment on the post.
 * 6. Create a reply to the parent comment using the replies endpoint (with
 *    parent_id set).
 * 7. Validate linkage: parent_id, post id consistency, author attribution, and
 *    content echoing.
 * 8. Optionally fetch the reply by id to confirm persistence.
 */
export async function test_api_comment_reply_create_success(
  connection: api.IConnection,
) {
  // 1) Authenticate: community member join (User A)
  const username: string = `user_${RandomGenerator.alphaNumeric(8)}`;
  const email: string = typia.random<string & tags.Format<"email">>();
  const password: string = `P${RandomGenerator.alphaNumeric(10)}`; // length >= 8
  const authorized: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(connection, {
      body: {
        username,
        email,
        password,
      } satisfies ICommunityPlatformCommunityMember.ICreate,
    });
  typia.assert(authorized);

  // 2) Discover a category (active, sorted by display_order)
  const categoriesPage: IPageICommunityPlatformCategory.ISummary =
    await api.functional.communityPlatform.categories.index(connection, {
      body: {
        page: 1 as number,
        limit: 50 as number,
        active: true,
        sortBy: "display_order",
        direction: "asc",
      } satisfies ICommunityPlatformCategory.IRequest,
    });
  typia.assert(categoriesPage);
  TestValidator.predicate(
    "at least one active category should exist",
    categoriesPage.data.length > 0,
  );
  const category = categoriesPage.data[0]!;

  // 3) Create a community under the discovered category
  const communityName = `c${RandomGenerator.alphabets(6)}`; // 7 chars, matches pattern and length
  const community: ICommunityPlatformCommunity =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      {
        body: {
          name: communityName,
          community_platform_category_id: category.id,
          description: RandomGenerator.paragraph({ sentences: 10 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);
  TestValidator.equals(
    "community owner should be the authenticated user",
    community.community_platform_user_id,
    authorized.id,
  );

  // 4) Create a post in the community
  const postTitle = RandomGenerator.paragraph({ sentences: 5 }); // 5-120 chars likely respected
  const postBody = RandomGenerator.content({ paragraphs: 2 }); // 10-10,000 chars constraint respected
  const post: ICommunityPlatformPost =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      {
        communityId: community.id,
        body: {
          title: postTitle,
          body: postBody,
          author_display_name: RandomGenerator.name(1),
        } satisfies ICommunityPlatformPost.ICreate,
      },
    );
  typia.assert(post);

  // 5) Create a parent (top-level) comment on the post
  const parentContent = RandomGenerator.paragraph({ sentences: 12 });
  const parent: ICommunityPlatformComment =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      connection,
      {
        postId: post.id,
        body: {
          content: parentContent,
          // parent_id omitted => top-level
        } satisfies ICommunityPlatformComment.ICreate,
      },
    );
  typia.assert(parent);
  TestValidator.equals(
    "parent comment must belong to the target post",
    parent.community_platform_post_id,
    post.id,
  );

  // 6) Create a reply under the parent comment (must set parent_id to path id)
  const replyContent = RandomGenerator.paragraph({ sentences: 8 });
  const reply: ICommunityPlatformComment =
    await api.functional.communityPlatform.communityMember.comments.replies.create(
      connection,
      {
        commentId: parent.id,
        body: {
          content: replyContent,
          parent_id: parent.id,
        } satisfies ICommunityPlatformComment.ICreate,
      },
    );
  typia.assert(reply);

  // 7) Validate linkage and author/content
  TestValidator.equals(
    "reply.parent_id equals parent.id",
    reply.parent_id,
    parent.id,
  );
  TestValidator.equals(
    "reply post id matches parent post id",
    reply.community_platform_post_id,
    parent.community_platform_post_id,
  );
  TestValidator.equals(
    "reply author is the authenticated user",
    reply.community_platform_user_id,
    authorized.id,
  );
  TestValidator.equals(
    "reply content echoes input",
    reply.content,
    replyContent,
  );

  // 8) Optional: fetch the reply by id and confirm
  const fetched: ICommunityPlatformComment =
    await api.functional.communityPlatform.comments.at(connection, {
      commentId: reply.id,
    });
  typia.assert(fetched);
  TestValidator.equals("fetched reply id matches", fetched.id, reply.id);
}
