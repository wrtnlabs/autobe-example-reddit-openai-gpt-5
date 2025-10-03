import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ICommunityPlatformUserRestriction } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUserRestriction";
import type { IEUserRestrictionType } from "@ORGANIZATION/PROJECT-api/lib/structures/IEUserRestrictionType";

/**
 * Guest guard: admin-only user restriction detail must reject unauthenticated
 * access.
 *
 * Business purpose:
 *
 * - Only site admins may retrieve a specific user restriction detail.
 * - Guests must be blocked from accessing this endpoint.
 *
 * Steps:
 *
 * 1. Build an unauthenticated connection (empty headers).
 * 2. Call GET /communityPlatform/siteAdmin/userRestrictions/{restrictionId} with a
 *    random UUID.
 * 3. Expect error via TestValidator.error (no status/message assertions per
 *    policy).
 */
export async function test_api_user_restriction_detail_guest_guard(
  connection: api.IConnection,
) {
  // Build unauthenticated connection
  const unauthConn: api.IConnection = { ...connection, headers: {} };

  // Random valid UUID for the path parameter
  const restrictionId = typia.random<string & tags.Format<"uuid">>();

  // Guest guard: the call must fail for unauthenticated users
  await TestValidator.error(
    "guest user cannot access admin-only restriction detail",
    async () => {
      await api.functional.communityPlatform.siteAdmin.userRestrictions.at(
        unauthConn,
        { restrictionId },
      );
    },
  );
}
