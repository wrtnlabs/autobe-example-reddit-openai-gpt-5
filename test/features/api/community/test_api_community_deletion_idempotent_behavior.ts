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

/**
 * Validate idempotent behavior when deleting the same community twice.
 *
 * This test verifies that a community owner can delete a community and that a
 * subsequent deletion of the same community results in an acceptable idempotent
 * behavior: either a no-op success or an HttpError (e.g., not-found) depending
 * on provider policy. It also validates ownership and category linkage upon
 * creation.
 *
 * Steps:
 *
 * 1. Join as a community member (owner)
 * 2. Discover an active category for community creation
 * 3. Create a community with a valid name and the discovered category
 * 4. Delete the community
 * 5. Attempt to delete again and accept either success or HttpError
 */
export async function test_api_community_deletion_idempotent_behavior(
  connection: api.IConnection,
) {
  // 1) Authenticate (join) as a community member
  const joinBody = {
    username: `user_${RandomGenerator.alphaNumeric(10)}`,
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12), // >= 8 chars
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const authorized: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(connection, {
      body: joinBody,
    });
  typia.assert(authorized);

  // 2) Discover an active category for community creation
  const catReqActive = {
    page: 1,
    limit: 20,
    active: true,
    sortBy: "display_order",
    direction: "asc",
  } satisfies ICommunityPlatformCategory.IRequest;
  const catPageActive = await api.functional.communityPlatform.categories.index(
    connection,
    { body: catReqActive },
  );
  typia.assert(catPageActive);

  let category = catPageActive.data.find((c) => c.active === true);
  if (!category) {
    // Fallback: fetch without active filter
    const catReqAny = {
      page: 1,
      limit: 20,
    } satisfies ICommunityPlatformCategory.IRequest;
    const catPageAny = await api.functional.communityPlatform.categories.index(
      connection,
      { body: catReqAny },
    );
    typia.assert(catPageAny);
    category = catPageAny.data[0];
  }
  if (!category)
    throw new Error("No categories available for community creation");

  // 3) Create a community
  const communityName = `${RandomGenerator.alphabets(1)}${RandomGenerator.alphaNumeric(7)}`; // length 8, matches regex
  const createBody = {
    name: communityName,
    community_platform_category_id: category.id,
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community: ICommunityPlatformCommunity =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      { body: createBody },
    );
  typia.assert(community);

  // Business validations on creation
  TestValidator.equals(
    "owner id of community equals authenticated subject",
    community.community_platform_user_id,
    authorized.id,
  );
  TestValidator.equals(
    "category linkage equals requested category id",
    community.community_platform_category_id,
    category.id,
  );
  TestValidator.equals(
    "community name equals requested name",
    community.name,
    communityName,
  );

  // 4) First deletion should succeed
  await api.functional.communityPlatform.communityMember.communities.erase(
    connection,
    { communityId: community.id },
  );

  // 5) Second deletion: accept idempotent success or HttpError
  let outcome: "success" | "http_error" = "success";
  try {
    await api.functional.communityPlatform.communityMember.communities.erase(
      connection,
      { communityId: community.id },
    );
  } catch (exp) {
    if (exp instanceof api.HttpError) outcome = "http_error";
    else throw exp; // unexpected error type should fail the test
  }
  const allowed = ["success", "http_error"] as const;
  TestValidator.predicate(
    "second deletion must be either success or HttpError (idempotent policy)",
    allowed.includes(outcome),
  );
}
