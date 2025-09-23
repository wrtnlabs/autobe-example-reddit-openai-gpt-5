import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformRecentCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRecentCommunity";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";
import type { IECommunityPlatformRecentCommunityOrderBy } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformRecentCommunityOrderBy";
import type { IESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IESortDirection";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformRecentCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformRecentCommunity";

/**
 * Verify that a newly registered user with no activity receives an empty recent
 * communities list with correct pagination metadata.
 *
 * Steps:
 *
 * 1. Join as communityMember and capture the authorized user id.
 * 2. Call PATCH
 *    /communityPlatform/communityMember/users/{userId}/recentCommunities with
 *    page=1 and limit=10.
 * 3. Validate that the response is empty and pagination totals indicate zero
 *    records.
 */
export async function test_api_recent_communities_empty_for_new_user(
  connection: api.IConnection,
) {
  // 1) Join as communityMember (authenticate and capture userId)
  const username: string = `user_${RandomGenerator.alphaNumeric(8)}`;
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const password: string = `Pw_${RandomGenerator.alphaNumeric(10)}`; // >= 8 chars

  const authorized = await api.functional.auth.communityMember.join(
    connection,
    {
      body: {
        username,
        email,
        password,
      } satisfies ICommunityPlatformCommunityMember.ICreate,
    },
  );
  typia.assert(authorized);

  // 2) Call recent communities listing for the same userId
  const requestBody = {
    page: 1,
    limit: 10,
  } satisfies ICommunityPlatformRecentCommunity.IRequest;

  const page =
    await api.functional.communityPlatform.communityMember.users.recentCommunities.index(
      connection,
      {
        userId: authorized.id,
        body: requestBody,
      },
    );
  typia.assert(page);

  // 3) Validations: empty data and zero totals
  TestValidator.equals(
    "recent communities list is empty for new user",
    page.data.length,
    0,
  );
  TestValidator.equals(
    "pagination.records is zero for new user",
    page.pagination.records,
    0,
  );
  TestValidator.equals(
    "pagination.pages is zero when no records",
    page.pagination.pages,
    0,
  );
}
