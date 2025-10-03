import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ICommunityPlatformRegisteredMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRegisteredMember";
import type { IECommunityPlatformRegisteredMemberSort } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformRegisteredMemberSort";
import type { IEOrderDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IEOrderDirection";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformRegisteredMember } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformRegisteredMember";

/**
 * Guest guard: admin-only Registered Member assignment search must reject
 * unauthenticated access.
 *
 * Business context:
 *
 * - The endpoint lists registered member role assignments for administrative
 *   usage only.
 * - Guests (no Authorization) must be blocked from accessing admin resources.
 *
 * Steps:
 *
 * 1. Create a guest (unauthenticated) connection by cloning the provided
 *    connection with empty headers.
 * 2. Call the admin search endpoint with a minimal, valid request body.
 * 3. Validate that the API call throws an error (do not assert status codes or
 *    error messages).
 */
export async function test_api_registered_member_assignment_search_guest_guard(
  connection: api.IConnection,
) {
  // 1) Prepare a guest (unauthenticated) connection
  const guest: api.IConnection = { ...connection, headers: {} };

  // 2) Minimal valid request body for listing/searching
  const body = {
    // Intentionally empty to keep the focus on guard behavior
  } satisfies ICommunityPlatformRegisteredMember.IRequest;

  // 3) Expect error for guest access
  await TestValidator.error(
    "guest cannot access admin registered member listing",
    async () => {
      await api.functional.communityPlatform.siteAdmin.registeredMembers.index(
        guest,
        { body },
      );
    },
  );
}
