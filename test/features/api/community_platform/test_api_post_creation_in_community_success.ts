import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCategory";
import type { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformPost } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformPost";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";
import type { IECategorySortBy } from "@ORGANIZATION/PROJECT-api/lib/structures/IECategorySortBy";
import type { IESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IESortDirection";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformCategory";

/**
 * Validate community-scoped text post creation by an authenticated member.
 *
 * Flow:
 *
 * 1. Register and authenticate as communityMember (join) → token auto-applied.
 * 2. Discover an active category (categories.index) for community creation.
 * 3. Create a community with a valid immutable name and discovered category.
 * 4. Create a text-only post in that community with title/body/display name all
 *    within constraints.
 * 5. Validate linkage (community, author) and field persistence; ensure timestamps
 *    and deletion flag are sensible.
 * 6. Error paths (business logic only):
 *
 *    - Post creation on non-existent community should fail
 *    - Community creation with non-existent category should fail
 *    - Post creation with too-short title/body should fail
 *    - Optional: Unauthenticated post creation attempt should fail
 */
export async function test_api_post_creation_in_community_success(
  connection: api.IConnection,
) {
  // 1) Authenticate (join)
  const memberAuth = await api.functional.auth.communityMember.join(
    connection,
    {
      body: {
        username: RandomGenerator.name(1),
        email: typia.random<string & tags.Format<"email">>(),
        password: RandomGenerator.alphaNumeric(12),
      } satisfies ICommunityPlatformCommunityMember.ICreate,
    },
  );
  typia.assert(memberAuth);

  // 2) Discover an active category
  const categoriesPage =
    await api.functional.communityPlatform.categories.index(connection, {
      body: {
        page: 1 satisfies number as number,
        limit: 10 satisfies number as number,
        active: true,
        sortBy: "display_order",
        direction: "asc",
      } satisfies ICommunityPlatformCategory.IRequest,
    });
  typia.assert(categoriesPage);
  const category =
    categoriesPage.data.find((c) => c.active) ?? categoriesPage.data[0];
  await TestValidator.predicate(
    "at least one category should be available",
    async () => category !== undefined,
  );

  // 3) Create a community
  const communityName = `${RandomGenerator.alphabets(1)}${RandomGenerator.alphaNumeric(7)}`; // 8 chars, starts with letter
  const community =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      {
        body: {
          name: communityName,
          community_platform_category_id: category!.id,
          description: RandomGenerator.paragraph({ sentences: 6 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);

  // 4) Create a post in the community
  const buildBoundedText = (
    min: number,
    max: number,
    generator: () => string,
  ): string => {
    let s = generator();
    while (s.length < min) s += ` ${generator()}`;
    if (s.length > max) s = s.slice(0, max);
    return s;
  };
  const title = buildBoundedText(10, 20, () =>
    RandomGenerator.paragraph({ sentences: 4 }),
  );
  const body = buildBoundedText(50, 200, () =>
    RandomGenerator.content({
      paragraphs: 1,
      sentenceMin: 10,
      sentenceMax: 20,
    }),
  );
  const authorDisplay = RandomGenerator.name(1).slice(0, 32);

  const post =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      {
        communityId: community.id,
        body: {
          title,
          body,
          author_display_name: authorDisplay,
        } satisfies ICommunityPlatformPost.ICreate,
      },
    );
  typia.assert(post);

  // 5) Validate linkage and persistence
  TestValidator.equals(
    "post.community_platform_community_id equals created community id",
    post.community_platform_community_id,
    community.id,
  );
  // author_user_id should be the authenticated user's id
  typia.assertGuard<string & tags.Format<"uuid">>(post.author_user_id!);
  TestValidator.equals(
    "post.author_user_id equals authenticated user id",
    post.author_user_id!,
    memberAuth.id,
  );
  TestValidator.equals("post.title persisted", post.title, title);
  TestValidator.equals("post.body persisted", post.body, body);
  TestValidator.equals(
    "post.author_display_name persisted",
    post.author_display_name!,
    authorDisplay,
  );
  await TestValidator.predicate(
    "updated_at must not be earlier than created_at",
    async () => post.updated_at >= post.created_at,
  );
  TestValidator.equals(
    "deleted_at must be null on creation",
    post.deleted_at ?? null,
    null,
  );

  // 6-A) Error: post creation with non-existent community
  await TestValidator.error(
    "creating post in non-existent community must fail",
    async () => {
      await api.functional.communityPlatform.communityMember.communities.posts.create(
        connection,
        {
          communityId: "00000000-0000-0000-0000-000000000000",
          body: {
            title,
            body,
            author_display_name: authorDisplay,
          } satisfies ICommunityPlatformPost.ICreate,
        },
      );
    },
  );

  // 6-B) Error: community creation with non-existent category
  await TestValidator.error(
    "creating community with non-existent category must fail",
    async () => {
      const badName = `${RandomGenerator.alphabets(1)}${RandomGenerator.alphaNumeric(7)}`;
      await api.functional.communityPlatform.communityMember.communities.create(
        connection,
        {
          body: {
            name: badName,
            community_platform_category_id:
              "00000000-0000-0000-0000-000000000000",
            description: RandomGenerator.paragraph({ sentences: 5 }),
          } satisfies ICommunityPlatformCommunity.ICreate,
        },
      );
    },
  );

  // 6-C) Error: post creation with too-short title/body
  await TestValidator.error(
    "creating post with too-short title/body must fail",
    async () => {
      await api.functional.communityPlatform.communityMember.communities.posts.create(
        connection,
        {
          communityId: community.id,
          body: {
            title: "bad",
            body: "tiny",
            author_display_name: authorDisplay,
          } satisfies ICommunityPlatformPost.ICreate,
        },
      );
    },
  );

  // 6-D) Error: unauthenticated user cannot create post
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "unauthenticated user cannot create community post",
    async () => {
      await api.functional.communityPlatform.communityMember.communities.posts.create(
        unauthConn,
        {
          communityId: community.id,
          body: {
            title,
            body,
            author_display_name: authorDisplay,
          } satisfies ICommunityPlatformPost.ICreate,
        },
      );
    },
  );
}
