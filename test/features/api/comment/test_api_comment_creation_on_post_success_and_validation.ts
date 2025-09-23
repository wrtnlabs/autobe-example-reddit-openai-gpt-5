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
 * Create a top-level comment on a post and validate business rules and guards.
 *
 * Flow:
 *
 * 1. Join as a communityMember to authenticate and obtain subject id
 * 2. Discover an active category (fallback to any category if none active)
 * 3. Create a community under the category
 * 4. Create a post in the community
 * 5. SUCCESS: Create a top-level comment (no parent_id) on the post and validate
 *
 *    - Post relationship matches
 *    - Author relationship matches
 *    - Parent is null/undefined
 *    - Content echo matches
 * 6. FAILURE (validation): content too short (< 2 chars)
 * 7. FAILURE (authorization): unauthenticated attempt is rejected
 */
export async function test_api_comment_creation_on_post_success_and_validation(
  connection: api.IConnection,
) {
  // 1) Join as a community member
  const member = await api.functional.auth.communityMember.join(connection, {
    body: {
      username: `user_${RandomGenerator.alphaNumeric(10)}`,
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ICommunityPlatformCommunityMember.ICreate,
  });
  typia.assert(member);

  // 2) Discover an active category (fallback if none)
  let categories = await api.functional.communityPlatform.categories.index(
    connection,
    {
      body: {
        active: true,
      } satisfies ICommunityPlatformCategory.IRequest,
    },
  );
  typia.assert(categories);
  let chosen = categories.data.find((c) => c.active) ?? categories.data[0];
  if (!chosen) {
    categories = await api.functional.communityPlatform.categories.index(
      connection,
      { body: { active: null } satisfies ICommunityPlatformCategory.IRequest },
    );
    typia.assert(categories);
    TestValidator.predicate(
      "category list should not be empty on broadened query",
      categories.data.length > 0,
    );
    chosen = categories.data[0];
  }

  // 3) Create a community
  const communityName = `c${RandomGenerator.alphaNumeric(12)}`; // starts with letter, 13 chars total
  const community =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      {
        body: {
          name: communityName,
          community_platform_category_id: chosen.id,
          description: RandomGenerator.paragraph({ sentences: 8 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);

  // 4) Create a post within the community
  const post =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      {
        communityId: community.id,
        body: {
          title: RandomGenerator.paragraph({ sentences: 6 }),
          body: RandomGenerator.content({
            paragraphs: 2,
            sentenceMin: 8,
            sentenceMax: 16,
          }),
        } satisfies ICommunityPlatformPost.ICreate,
      },
    );
  typia.assert(post);

  // 5) SUCCESS: Create a top-level comment
  const contentOk = RandomGenerator.paragraph({ sentences: 10 });
  const created =
    await api.functional.communityPlatform.communityMember.posts.comments.create(
      connection,
      {
        postId: post.id,
        body: {
          content: contentOk,
        } satisfies ICommunityPlatformComment.ICreate,
      },
    );
  typia.assert(created);

  // Business validations for success path
  TestValidator.equals(
    "comment belongs to the target post",
    created.community_platform_post_id,
    post.id,
  );
  TestValidator.equals(
    "comment authored by the authenticated user",
    created.community_platform_user_id,
    member.id,
  );
  TestValidator.equals(
    "top-level comment has no parent (null or undefined)",
    created.parent_id ?? null,
    null,
  );
  TestValidator.equals(
    "comment content echoes input",
    created.content,
    contentOk,
  );

  // 6) FAILURE (validation): too-short content
  await TestValidator.error(
    "creating a comment with content shorter than 2 characters should fail",
    async () => {
      await api.functional.communityPlatform.communityMember.posts.comments.create(
        connection,
        {
          postId: post.id,
          body: {
            content: "a",
          } satisfies ICommunityPlatformComment.ICreate,
        },
      );
    },
  );

  // 7) FAILURE (authorization): unauthenticated attempt
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "unauthenticated user cannot create a comment",
    async () => {
      await api.functional.communityPlatform.communityMember.posts.comments.create(
        unauthConn,
        {
          postId: post.id,
          body: {
            content: RandomGenerator.paragraph({ sentences: 5 }),
          } satisfies ICommunityPlatformComment.ICreate,
        },
      );
    },
  );
}
