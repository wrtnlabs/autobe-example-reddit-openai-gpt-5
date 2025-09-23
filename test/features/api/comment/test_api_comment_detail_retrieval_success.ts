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
 * Retrieve a single existing comment by ID and verify entity fields.
 *
 * Steps
 *
 * 1. Join as communityMember
 * 2. Find an active category (requires at least one category in seed data)
 * 3. Create a community under that category
 * 4. Create a post in the community
 * 5. Create a top-level comment on the post
 * 6. Fetch the comment by ID and validate fields and relations
 */
export async function test_api_comment_detail_retrieval_success(
  connection: api.IConnection,
) {
  // 1) Join as a community member (auth handled by SDK automatically)
  const joinBody = {
    username: RandomGenerator.name(1).replace(/\s+/g, "").toLowerCase(),
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const authorized: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(connection, {
      body: joinBody,
    });
  typia.assert(authorized);

  // 2) Discover an active category (must exist in fixture/seed data)
  const catRequest = {
    active: true,
    page: 1,
    limit: 20,
    sortBy: "display_order",
    direction: "asc",
  } satisfies ICommunityPlatformCategory.IRequest;
  const catPage: IPageICommunityPlatformCategory.ISummary =
    await api.functional.communityPlatform.categories.index(connection, {
      body: catRequest,
    });
  typia.assert(catPage);
  TestValidator.predicate(
    "at least one active category exists",
    catPage.data.length > 0,
  );
  const category = catPage.data[0];

  // 3) Create a community
  const communityName: string = `${RandomGenerator.alphabets(1)}${RandomGenerator.alphaNumeric(6)}`; // starts with a letter, ends alnum, length 7
  const communityCreateBody = {
    name: communityName,
    community_platform_category_id: category.id,
    description: RandomGenerator.paragraph({ sentences: 8 }),
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community: ICommunityPlatformCommunity =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      { body: communityCreateBody },
    );
  typia.assert(community);

  // 4) Create a post under the community
  const postCreateBody = {
    title: RandomGenerator.paragraph({ sentences: 5 }),
    body: RandomGenerator.content({ paragraphs: 2 }),
  } satisfies ICommunityPlatformPost.ICreate;
  const post: ICommunityPlatformPost =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      {
        communityId: community.id,
        body: postCreateBody,
      },
    );
  typia.assert(post);

  // 5) Create a top-level comment on the post
  const commentCreateBody = {
    content: RandomGenerator.paragraph({ sentences: 6 }),
    parent_id: null,
  } satisfies ICommunityPlatformComment.ICreate;
  const createdComment: ICommunityPlatformComment =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      connection,
      {
        postId: post.id,
        body: commentCreateBody,
      },
    );
  typia.assert(createdComment);

  // 6) Retrieve the comment by ID
  const read: ICommunityPlatformComment =
    await api.functional.communityPlatform.comments.at(connection, {
      commentId: createdComment.id,
    });
  typia.assert(read);

  // Validations
  TestValidator.equals(
    "returned comment id matches created id",
    read.id,
    createdComment.id,
  );
  TestValidator.equals(
    "comment belongs to the target post",
    read.community_platform_post_id,
    post.id,
  );
  TestValidator.equals(
    "comment content matches input",
    read.content,
    commentCreateBody.content,
  );
  TestValidator.equals(
    "comment author equals authenticated member id",
    read.community_platform_user_id,
    authorized.id,
  );
  TestValidator.predicate(
    "parent_id is empty (null or undefined) for top-level comment",
    read.parent_id === null || read.parent_id === undefined,
  );
}
