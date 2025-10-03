import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ICommunityPlatformSiteAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSiteAdmin";
import type { IECommunityPlatformSiteAdminSort } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformSiteAdminSort";
import type { IEOrderDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IEOrderDirection";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformSiteAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformSiteAdmin";

export async function test_api_site_admin_assignments_listing_unauthenticated_guard(
  connection: api.IConnection,
) {
  /**
   * Guard test: unauthenticated callers must not list Site Admin assignments.
   *
   * Steps:
   *
   * 1. Create a guest (unauthenticated) connection by cloning the provided
   *    connection with empty headers (no token handling here; SDK manages it).
   * 2. Attempt to call the listing endpoint with a minimal valid body.
   * 3. Expect an error to be thrown (do not assert specific status codes or
   *    messages; only that an error occurs).
   */

  // 1) Guest connection (do not manipulate headers after creation)
  const guestConnection: api.IConnection = { ...connection, headers: {} };

  // 2) Minimal, valid request body for listing/searching
  const requestBody = {} satisfies ICommunityPlatformSiteAdmin.IRequest;

  // 3) Unauthenticated access must fail
  await TestValidator.error(
    "guest cannot list site admin assignments",
    async () => {
      await api.functional.communityPlatform.siteAdmin.siteAdmins.index(
        guestConnection,
        { body: requestBody },
      );
    },
  );
}
