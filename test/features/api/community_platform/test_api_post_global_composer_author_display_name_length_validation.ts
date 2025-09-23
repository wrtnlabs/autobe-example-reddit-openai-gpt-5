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
 * Validate global composer author_display_name boundary behavior and required
 * context.
 *
 * This test ensures the global composer enforces the author_display_name length
 * constraints (0–32) without violating compile-time DTO constraints, and it
 * validates that the community id is required by business rules for the global
 * composer endpoint.
 *
 * Steps:
 *
 * 1. Authenticate as communityMember (join)
 * 2. Discover categories and pick an active one (fallback to any if none)
 * 3. Create a community bound to the chosen category
 * 4. Create a post with author_display_name length 32 (boundary max) → success
 * 5. Create a post with author_display_name as empty string "" (boundary min) →
 *    success
 * 6. Create a post with author_display_name = null (nullable) → success
 * 7. Attempt to create a post without community_platform_community_id → expect
 *    error
 */
export async function test_api_post_global_composer_author_display_name_length_validation(
  connection: api.IConnection,
) {
  // 1) Authenticate as communityMember (join)
  const authorized = await api.functional.auth.communityMember.join(
    connection,
    {
      body: {
        username: RandomGenerator.name(1),
        email: typia.random<string & tags.Format<"email">>(),
        password: RandomGenerator.alphaNumeric(12),
      } satisfies ICommunityPlatformCommunityMember.ICreate,
    },
  );
  typia.assert(authorized);

  // 2) Discover categories and pick an active one (fallback to any if none)
  const pageActive = await api.functional.communityPlatform.categories.index(
    connection,
    {
      body: {
        page: 1,
        limit: 20,
        active: true,
      } satisfies ICommunityPlatformCategory.IRequest,
    },
  );
  typia.assert(pageActive);

  let categories = pageActive.data;
  if (categories.length === 0) {
    const pageAny = await api.functional.communityPlatform.categories.index(
      connection,
      {
        body: {
          page: 1,
          limit: 20,
          active: null,
        } satisfies ICommunityPlatformCategory.IRequest,
      },
    );
    typia.assert(pageAny);
    categories = pageAny.data;
  }
  if (categories.length === 0) {
    throw new Error("No categories available to create a community.");
  }
  const categoryId = categories[0].id;

  // 3) Create a community bound to the chosen category
  const community =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      {
        body: {
          name: `c${RandomGenerator.alphaNumeric(11)}`,
          community_platform_category_id: categoryId,
          description: RandomGenerator.paragraph({ sentences: 8 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);

  // Helper creators for title/body within limits
  const mkTitle = () => RandomGenerator.paragraph({ sentences: 6 });
  const mkBody = () =>
    RandomGenerator.content({
      paragraphs: 2,
      sentenceMin: 8,
      sentenceMax: 12,
      wordMin: 3,
      wordMax: 8,
    });

  // 4) Success: author_display_name length exactly 32
  const display32 = RandomGenerator.alphaNumeric(32);
  const postA =
    await api.functional.communityPlatform.communityMember.posts.create(
      connection,
      {
        body: {
          community_platform_community_id: community.id,
          title: mkTitle(),
          body: mkBody(),
          author_display_name: display32,
        } satisfies ICommunityPlatformPost.ICreate,
      },
    );
  typia.assert(postA);
  TestValidator.equals(
    "postA belongs to created community",
    postA.community_platform_community_id,
    community.id,
  );
  TestValidator.equals(
    "author_display_name accepts 32 chars",
    postA.author_display_name,
    display32,
  );

  // 5) Success: author_display_name as empty string ""
  const postB =
    await api.functional.communityPlatform.communityMember.posts.create(
      connection,
      {
        body: {
          community_platform_community_id: community.id,
          title: mkTitle(),
          body: mkBody(),
          author_display_name: "",
        } satisfies ICommunityPlatformPost.ICreate,
      },
    );
  typia.assert(postB);
  TestValidator.equals(
    "author_display_name accepts empty string (0 length)",
    postB.author_display_name,
    "",
  );
  TestValidator.equals(
    "postB belongs to created community",
    postB.community_platform_community_id,
    community.id,
  );

  // 6) Success: author_display_name = null
  const postC =
    await api.functional.communityPlatform.communityMember.posts.create(
      connection,
      {
        body: {
          community_platform_community_id: community.id,
          title: mkTitle(),
          body: mkBody(),
          author_display_name: null,
        } satisfies ICommunityPlatformPost.ICreate,
      },
    );
  typia.assert(postC);
  TestValidator.equals(
    "author_display_name accepts null",
    postC.author_display_name,
    null,
  );
  TestValidator.equals(
    "postC belongs to created community",
    postC.community_platform_community_id,
    community.id,
  );

  // 7) Error: missing community_platform_community_id should be rejected
  await TestValidator.error(
    "global composer requires community id (omit should fail)",
    async () => {
      await api.functional.communityPlatform.communityMember.posts.create(
        connection,
        {
          body: {
            title: mkTitle(),
            body: mkBody(),
            author_display_name: RandomGenerator.name(1),
          } satisfies ICommunityPlatformPost.ICreate,
        },
      );
    },
  );
}
