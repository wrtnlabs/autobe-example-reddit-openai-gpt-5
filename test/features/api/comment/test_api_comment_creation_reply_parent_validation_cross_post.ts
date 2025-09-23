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

export async function test_api_comment_creation_reply_parent_validation_cross_post(
  connection: api.IConnection,
) {
  // 1) Authenticate as community member
  const member = await api.functional.auth.communityMember.join(connection, {
    body: {
      username: `user_${RandomGenerator.alphabets(8)}`,
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12), // >= 8 chars
    } satisfies ICommunityPlatformCommunityMember.ICreate,
  });
  typia.assert(member);

  // 2) Discover an active category
  const categoriesPage =
    await api.functional.communityPlatform.categories.index(connection, {
      body: {
        page: 1,
        limit: 20,
        active: true,
        sortBy: "display_order",
        direction: "asc",
      } satisfies ICommunityPlatformCategory.IRequest,
    });
  typia.assert(categoriesPage);
  TestValidator.predicate(
    "categories data should not be empty",
    categoriesPage.data.length > 0,
  );
  const category = categoriesPage.data[0];

  // 3) Create a community
  const communityName = `c${RandomGenerator.alphaNumeric(8)}`; // starts with letter, ends alnum
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

  // 4) Create two posts (A and B)
  const postABody = RandomGenerator.content({ paragraphs: 2 });
  const postA =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      {
        communityId: community.id,
        body: {
          title: RandomGenerator.paragraph({ sentences: 5 }),
          body: postABody,
          author_display_name: RandomGenerator.name(1),
        } satisfies ICommunityPlatformPost.ICreate,
      },
    );
  typia.assert(postA);

  const postB =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      {
        communityId: community.id,
        body: {
          title: RandomGenerator.paragraph({ sentences: 6 }),
          body: RandomGenerator.content({ paragraphs: 2 }),
          author_display_name: RandomGenerator.name(1),
        } satisfies ICommunityPlatformPost.ICreate,
      },
    );
  typia.assert(postB);

  // 5) Create two top-level parent comments (parent_A on post A, parent_B on post B)
  const parentContentA = RandomGenerator.paragraph({ sentences: 12 });
  const parentA =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      connection,
      {
        postId: postA.id,
        body: {
          content: parentContentA,
          parent_id: null,
        } satisfies ICommunityPlatformComment.ICreate,
      },
    );
  typia.assert(parentA);

  const parentContentB = RandomGenerator.paragraph({ sentences: 10 });
  const parentB =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      connection,
      {
        postId: postB.id,
        body: {
          content: parentContentB,
          parent_id: null,
        } satisfies ICommunityPlatformComment.ICreate,
      },
    );
  typia.assert(parentB);

  // Validate top-level parents have null parent_id
  TestValidator.equals(
    "parent_A is a top-level comment",
    parentA.parent_id,
    null,
  );
  TestValidator.equals(
    "parent_B is a top-level comment",
    parentB.parent_id,
    null,
  );

  // Success: Create a reply on post A to parent_A
  const replyContent = RandomGenerator.paragraph({ sentences: 8 });
  const reply =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      connection,
      {
        postId: postA.id,
        body: {
          content: replyContent,
          parent_id: parentA.id,
        } satisfies ICommunityPlatformComment.ICreate,
      },
    );
  typia.assert(reply);

  // Business validations for the reply
  TestValidator.equals(
    "reply belongs to post A",
    reply.community_platform_post_id,
    postA.id,
  );
  TestValidator.predicate(
    "reply has non-null parent_id",
    reply.parent_id !== null && reply.parent_id !== undefined,
  );
  TestValidator.equals(
    "reply parent_id equals parent_A.id",
    reply.parent_id,
    parentA.id,
  );
  TestValidator.equals(
    "reply content echoes input",
    reply.content,
    replyContent,
  );

  // Failure #1: Cross-post parent reference (use parent_B on post A)
  await TestValidator.error(
    "cross-post parentId must be rejected",
    async () => {
      await api.functional.communityPlatform.communityMember.posts.comments.create(
        connection,
        {
          postId: postA.id,
          body: {
            content: RandomGenerator.paragraph({ sentences: 6 }),
            parent_id: parentB.id,
          } satisfies ICommunityPlatformComment.ICreate,
        },
      );
    },
  );

  // Failure #2: Non-existent parent_id (valid UUID that doesn't match any comment)
  const nonExistentParentId = (() => {
    let x: string & tags.Format<"uuid">;
    do {
      x = typia.random<string & tags.Format<"uuid">>();
    } while (x === parentA.id || x === parentB.id);
    return x;
  })();

  await TestValidator.error(
    "non-existent parentId must be rejected",
    async () => {
      await api.functional.communityPlatform.communityMember.posts.comments.create(
        connection,
        {
          postId: postA.id,
          body: {
            content: RandomGenerator.paragraph({ sentences: 6 }),
            parent_id: nonExistentParentId,
          } satisfies ICommunityPlatformComment.ICreate,
        },
      );
    },
  );
}
