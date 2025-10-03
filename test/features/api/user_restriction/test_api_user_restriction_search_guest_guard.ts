import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ICommunityPlatformUserRestriction } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUserRestriction";
import type { IEOrderDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IEOrderDirection";
import type { IEUserRestrictionSortBy } from "@ORGANIZATION/PROJECT-api/lib/structures/IEUserRestrictionSortBy";
import type { IEUserRestrictionType } from "@ORGANIZATION/PROJECT-api/lib/structures/IEUserRestrictionType";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformUserRestriction } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformUserRestriction";

/**
 * Verify guest guard for admin-only user restriction search.
 *
 * Business intent:
 *
 * - Site admin-only endpoint must reject unauthenticated requests with a standard
 *   auth guard.
 * - We do not validate exact status code or message; only that an error occurs
 *   when unauthenticated.
 *
 * Steps:
 *
 * 1. Create an unauthenticated connection by cloning the given connection and
 *    setting empty headers.
 * 2. Prepare a minimal, valid request body for search (all properties optional).
 * 3. Call PATCH /communityPlatform/siteAdmin/userRestrictions with unauthenticated
 *    connection and expect an error.
 */
export async function test_api_user_restriction_search_guest_guard(
  connection: api.IConnection,
) {
  // 1) Prepare unauthenticated connection (allowed pattern; do not touch headers afterwards)
  const unauthConn: api.IConnection = { ...connection, headers: {} };

  // 2) Minimal valid request body
  const searchBody = {} satisfies ICommunityPlatformUserRestriction.IRequest;

  // 3) Expect the admin-only endpoint to reject guest (unauthenticated) call
  await TestValidator.error(
    "guest guard blocks admin user restriction search",
    async () => {
      await api.functional.communityPlatform.siteAdmin.userRestrictions.index(
        unauthConn,
        {
          body: searchBody,
        },
      );
    },
  );
}
