import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformSiteAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSiteAdmin";
import type { ICommunityPlatformSiteAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSiteAdminJoin";
import type { ICommunityPlatformUserRestriction } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUserRestriction";
import type { IEUserRestrictionType } from "@ORGANIZATION/PROJECT-api/lib/structures/IEUserRestrictionType";

export async function test_api_user_restriction_detail_not_found_admin(
  connection: api.IConnection,
) {
  /**
   * Purpose: Ensure that a site admin querying a non-existent user restriction
   * detail results in an error (not found), without leaking internal details.
   *
   * Steps:
   *
   * 1. Join as a site admin to obtain an authenticated session.
   * 2. Attempt to fetch a user restriction detail using a random, non-existent
   *    UUID.
   * 3. Validate that the call fails (runtime error occurs).
   */

  // 1) Admin registration and authentication
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    username: RandomGenerator.alphaNumeric(12), // 3-30, starts/ends alphanumeric, regex-compliant
    password: RandomGenerator.alphaNumeric(12), // 8-128
    displayName: RandomGenerator.name(), // 0-64, optional
  } satisfies ICommunityPlatformSiteAdminJoin.ICreate;

  const admin = await api.functional.auth.siteAdmin.join(connection, {
    body: joinBody,
  });
  typia.assert(admin);

  // 2) Prepare a random UUID that should not exist as a restriction id
  const unknownRestrictionId = typia.random<string & tags.Format<"uuid">>();

  // 3) Expect error when accessing a non-existent restriction detail
  await TestValidator.error(
    "admin get non-existent user restriction should fail",
    async () => {
      await api.functional.communityPlatform.siteAdmin.userRestrictions.at(
        connection,
        { restrictionId: unknownRestrictionId },
      );
    },
  );
}
