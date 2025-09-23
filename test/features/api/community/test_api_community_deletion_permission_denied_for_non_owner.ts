import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCategory";
import type { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";
import type { IECategorySortBy } from "@ORGANIZATION/PROJECT-api/lib/structures/IECategorySortBy";
import type { IESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IESortDirection";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformCategory";

export async function test_api_community_deletion_permission_denied_for_non_owner(
  connection: api.IConnection,
) {
  /**
   * Validate that a non-owner cannot delete another user's community.
   *
   * Steps:
   *
   * 1. Create two independent connections to isolate auth tokens (User A, User B).
   * 2. Join as User A (owner).
   * 3. List active categories and pick one for creation.
   * 4. Create a community as User A and verify owner binding.
   * 5. Join as User B (non-owner) on a separate connection.
   * 6. Attempt to delete the community as User B — expect an error (authorization
   *    failure).
   * 7. Ensure community still exists by deleting it as User A — should succeed (no
   *    error).
   */

  // 1) Create two independent connections (DO NOT mutate headers beyond creation)
  const userAConn: api.IConnection = { ...connection, headers: {} };
  const userBConn: api.IConnection = { ...connection, headers: {} };

  // Helper to generate a unique, spec-compliant community name
  const makeCommunityName = (): string => {
    // Pattern: ^[A-Za-z][A-Za-z0-9_-]{1,30}[A-Za-z0-9]$ and length 3-32
    // Start with a letter 'c', then 10 alphanumerics, and end with an alphanumeric
    return `c${RandomGenerator.alphaNumeric(10)}`; // length >= 11, starts with a letter, ends alnum
  };

  // 2) Join as User A
  const userAJoinBody = {
    username: `user_${RandomGenerator.alphaNumeric(12)}`,
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const userAAuth: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(userAConn, {
      body: userAJoinBody,
    });
  typia.assert(userAAuth);

  // 3) List active categories (public discovery)
  const categoriesReq = {
    page: 1,
    limit: 20,
    active: true,
    sortBy: "display_order" as IECategorySortBy,
    direction: "asc" as IESortDirection,
  } satisfies ICommunityPlatformCategory.IRequest;
  const categoryPage: IPageICommunityPlatformCategory.ISummary =
    await api.functional.communityPlatform.categories.index(userAConn, {
      body: categoriesReq,
    });
  typia.assert(categoryPage);

  TestValidator.predicate(
    "active category list should not be empty",
    categoryPage.data.length > 0,
  );
  const selectedCategory =
    categoryPage.data.find((c) => c.active) ?? categoryPage.data[0]!;
  const categoryId = typia.assert<string & tags.Format<"uuid">>(
    selectedCategory.id,
  );

  // 4) Create a community as User A
  const createCommunityBody = {
    name: makeCommunityName(),
    community_platform_category_id: categoryId,
    description: RandomGenerator.paragraph({ sentences: 8 }),
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community: ICommunityPlatformCommunity =
    await api.functional.communityPlatform.communityMember.communities.create(
      userAConn,
      { body: createCommunityBody },
    );
  typia.assert(community);

  // Owner binding must match User A
  TestValidator.equals(
    "created community owner should be User A",
    community.community_platform_user_id,
    userAAuth.id,
  );

  // 5) Join as User B on a separate connection
  const userBJoinBody = {
    username: `user_${RandomGenerator.alphaNumeric(12)}`,
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const userBAuth: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(userBConn, {
      body: userBJoinBody,
    });
  typia.assert(userBAuth);

  // 6) Non-owner delete attempt must fail
  await TestValidator.error(
    "non-owner cannot delete someone else's community",
    async () => {
      await api.functional.communityPlatform.communityMember.communities.erase(
        userBConn,
        { communityId: community.id },
      );
    },
  );

  // 7) Deleting as the owner should succeed (no error thrown)
  await api.functional.communityPlatform.communityMember.communities.erase(
    userAConn,
    { communityId: community.id },
  );
}
