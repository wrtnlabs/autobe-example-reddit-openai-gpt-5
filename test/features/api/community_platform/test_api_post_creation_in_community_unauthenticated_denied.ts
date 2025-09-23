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
 * Deny unauthenticated post creation within a community.
 *
 * This E2E validates that only authenticated community members can create
 * posts. The test performs authenticated setup to create a valid community,
 * then attempts to create a post using an unauthenticated (guest) connection
 * and expects an authorization error.
 *
 * Steps:
 *
 * 1. Join as a communityMember (authenticated session issued by SDK)
 * 2. List active categories and pick one
 * 3. Create a community under the authenticated user
 * 4. Create a fresh unauthenticated connection (headers: {})
 * 5. Attempt to create a post as a guest and expect failure
 */
export async function test_api_post_creation_in_community_unauthenticated_denied(
  connection: api.IConnection,
) {
  // 1) Join as a community member to get an authenticated session
  const joinBody = {
    username: `${RandomGenerator.alphabets(1)}_${RandomGenerator.alphaNumeric(11)}`,
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const authorized: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(connection, {
      body: joinBody,
    });
  typia.assert(authorized);

  // 2) List categories (active only) and pick the first
  const categoriesReq = {
    page: 1,
    limit: 5,
    active: true,
    sortBy: "display_order",
    direction: "asc",
  } satisfies ICommunityPlatformCategory.IRequest;
  const page: IPageICommunityPlatformCategory.ISummary =
    await api.functional.communityPlatform.categories.index(connection, {
      body: categoriesReq,
    });
  typia.assert(page);
  TestValidator.predicate(
    "at least one category should exist for setup",
    page.data.length > 0,
  );
  const category = page.data[0];
  TestValidator.predicate(
    "picked category should be active",
    category.active === true,
  );

  // 3) Create a community under the authenticated user
  const communityName = `${RandomGenerator.alphabets(1)}${RandomGenerator.alphaNumeric(7)}`; // starts with a letter, 8 chars total
  const communityBody = {
    name: communityName,
    community_platform_category_id: category.id,
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community: ICommunityPlatformCommunity =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      {
        body: communityBody,
      },
    );
  typia.assert(community);
  TestValidator.equals(
    "community owner should be the authenticated user",
    community.community_platform_user_id,
    authorized.id,
  );

  // 4) Create an unauthenticated connection to simulate a guest
  const guest: api.IConnection = { ...connection, headers: {} };

  // 5) Attempt to create a post as a guest and expect authorization error
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

  await TestValidator.error(
    "unauthenticated caller cannot create a post in a community",
    async () => {
      await api.functional.communityPlatform.communityMember.communities.posts.create(
        guest,
        {
          communityId: community.id,
          body: postBody,
        },
      );
    },
  );
}
