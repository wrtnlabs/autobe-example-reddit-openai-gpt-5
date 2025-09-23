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
import type { IECommunityPlatformCommentSort } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformCommentSort";
import type { IESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IESortDirection";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformCategory";
import type { IPageICommunityPlatformComment } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformComment";

export async function test_api_comment_replies_parent_missing_or_removed(
  connection: api.IConnection,
) {
  // 1) Authenticate community member
  const joinBody = {
    username: RandomGenerator.name(1).replace(/\s+/g, ""),
    email: typia.random<string & tags.Format<"email">>(),
    password: `P${RandomGenerator.alphaNumeric(11)}`,
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const authorized = await api.functional.auth.communityMember.join(
    connection,
    {
      body: joinBody,
    },
  );
  typia.assert(authorized);

  // 2) Discover category for community creation
  const categories = await api.functional.communityPlatform.categories.index(
    connection,
    {
      body: {
        page: 1,
        limit: 20,
        active: true,
        sortBy: "display_order",
        direction: "asc",
      } satisfies ICommunityPlatformCategory.IRequest,
    },
  );
  typia.assert(categories);
  TestValidator.predicate(
    "at least one active category should exist for community creation",
    categories.data.length > 0,
  );
  const categoryId = categories.data[0]!.id; // safe due to predicate above

  // 3) Create a community
  // name must satisfy: ^[A-Za-z][A-Za-z0-9_-]{1,30}[A-Za-z0-9]$ and length 3~32
  const communityName = `c${RandomGenerator.alphaNumeric(6)}0`;
  const communityBody = {
    name: communityName,
    community_platform_category_id: categoryId,
    description: null,
    logo: null,
    banner: null,
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      { body: communityBody },
    );
  typia.assert(community);

  // 4) Create a post in the community
  const postBody = {
    title: RandomGenerator.paragraph({ sentences: 5 }),
    body: RandomGenerator.content({
      paragraphs: 1,
      sentenceMin: 10,
      sentenceMax: 20,
    }),
    author_display_name: null,
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

  // 5) Create a top-level parent comment on the post
  const parentCommentBody = {
    content: RandomGenerator.paragraph({ sentences: 12 }),
    parent_id: null,
  } satisfies ICommunityPlatformComment.ICreate;
  const parent =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      connection,
      {
        postId: post.id,
        body: parentCommentBody,
      },
    );
  typia.assert(parent);

  // 6) Sanity: listing replies BEFORE deletion should succeed (likely empty)
  const listReqBefore = {
    page: 0,
    limit: 10,
    sort: "Newest",
  } satisfies ICommunityPlatformComment.IRequest;
  const repliesBefore =
    await api.functional.communityPlatform.comments.replies.index(connection, {
      commentId: parent.id,
      body: listReqBefore,
    });
  typia.assert(repliesBefore);

  // 7) Soft-delete the parent comment
  await api.functional.communityPlatform.communityMember.comments.erase(
    connection,
    { commentId: parent.id },
  );

  // 8) Target: listing replies of DELETED parent should throw
  const listReqAfter = {
    page: 0,
    limit: 10,
    sort: "Newest",
  } satisfies ICommunityPlatformComment.IRequest;
  await TestValidator.error(
    "listing replies for a deleted parent comment should be rejected",
    async () => {
      await api.functional.communityPlatform.comments.replies.index(
        connection,
        {
          commentId: parent.id,
          body: listReqAfter,
        },
      );
    },
  );
}
