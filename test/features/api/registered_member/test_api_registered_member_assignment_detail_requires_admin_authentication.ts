import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ICommunityPlatformRegisteredMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRegisteredMember";

export async function test_api_registered_member_assignment_detail_requires_admin_authentication(
  connection: api.IConnection,
) {
  /**
   * Verify that admin-only endpoint rejects unauthenticated access.
   *
   * Steps:
   *
   * 1. Create a guest connection with empty headers.
   * 2. Generate a valid UUID for the path parameter.
   * 3. Attempt to fetch the registered member assignment detail as guest and
   *    assert that an error occurs (guard is effective).
   */

  // 1) Guest (unauthenticated) connection — do not touch headers after creation
  const guestConnection: api.IConnection = { ...connection, headers: {} };

  // 2) Well-formed UUID for path parameter
  const registeredMemberId = typia.random<string & tags.Format<"uuid">>();

  // 3) Expect error due to missing authentication (no status/message assertion)
  await TestValidator.error(
    "unauthenticated access is rejected for admin-only registered member detail",
    async () => {
      await api.functional.communityPlatform.siteAdmin.registeredMembers.at(
        guestConnection,
        { registeredMemberId },
      );
    },
  );
}
