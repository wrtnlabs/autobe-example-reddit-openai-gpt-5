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
 * Permission denial when a non-author tries to delete a comment.
 *
 * Flow overview:
 *
 * 1. Join as User A and set up data: pick a category, create a community, a post,
 *    and a comment authored by User A.
 * 2. Join as User B (auth context switches automatically via SDK) and attempt to
 *    delete User A's comment.
 * 3. Expect an error (authorization denial). Do not validate specific HTTP status
 *    or message.
 * 4. Verify the comment still exists by fetching it again.
 */
export async function test_api_comment_delete_permission_denied_non_author(
  connection: api.IConnection,
) {
  // 1) User A joins
  const joinABody = {
    username: RandomGenerator.name(1),
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const userA: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(connection, {
      body: joinABody,
    });
  typia.assert(userA);

  // Discover a category (try active only first)
  const catReqActive = {
    active: true,
    limit: 20,
    sortBy: "display_order",
    direction: "asc",
  } satisfies ICommunityPlatformCategory.IRequest;
  const pageActive: IPageICommunityPlatformCategory.ISummary =
    await api.functional.communityPlatform.categories.index(connection, {
      body: catReqActive,
    });
  typia.assert(pageActive);

  let chosenCategory = pageActive.data[0];
  if (!chosenCategory) {
    // Retry with broader filter
    const catReqAny = {
      active: null,
      limit: 20,
      sortBy: "display_order",
      direction: "asc",
    } satisfies ICommunityPlatformCategory.IRequest;
    const pageAny: IPageICommunityPlatformCategory.ISummary =
      await api.functional.communityPlatform.categories.index(connection, {
        body: catReqAny,
      });
    typia.assert(pageAny);
    chosenCategory = pageAny.data[0];
  }

  TestValidator.predicate(
    "at least one category exists for community creation",
    chosenCategory !== undefined,
  );

  // Create a community (User A)
  const communityName: string = `c${RandomGenerator.alphaNumeric(6)}`;
  const communityBody = {
    name: communityName,
    community_platform_category_id: chosenCategory!.id,
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community: ICommunityPlatformCommunity =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      { body: communityBody },
    );
  typia.assert(community);

  // Create a post in the community (User A)
  const postBody = {
    title: RandomGenerator.paragraph({ sentences: 5 }),
    body: RandomGenerator.content({
      paragraphs: 2,
      sentenceMin: 8,
      sentenceMax: 15,
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

  // Create a comment under the post (User A)
  const commentBody = {
    content: RandomGenerator.paragraph({ sentences: 10 }),
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

  // 2) User B joins (auth context switches)
  const joinBBody = {
    username: RandomGenerator.name(1),
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const userB: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(connection, {
      body: joinBBody,
    });
  typia.assert(userB);

  // 3) Forbidden attempt: User B tries to delete User A's comment
  await TestValidator.error(
    "non-author must be denied when attempting to delete another user's comment",
    async () => {
      await api.functional.communityPlatform.communityMember.comments.erase(
        connection,
        { commentId: comment.id },
      );
    },
  );

  // 4) Post-condition: the comment must still exist
  const readBack: ICommunityPlatformComment =
    await api.functional.communityPlatform.comments.at(connection, {
      commentId: comment.id,
    });
  typia.assert(readBack);
  TestValidator.equals(
    "comment id remains unchanged after denied deletion",
    readBack.id,
    comment.id,
  );
  TestValidator.equals(
    "comment content remains same after denied deletion",
    readBack.content,
    comment.content,
  );
}
