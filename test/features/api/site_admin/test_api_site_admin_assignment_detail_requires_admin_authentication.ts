import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ICommunityPlatformSiteAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSiteAdmin";

/**
 * Verify unauthenticated access to site admin assignment detail is blocked.
 *
 * Context:
 *
 * - The endpoint GET /communityPlatform/siteAdmin/siteAdmins/{siteAdminId}
 *   requires administrative privileges.
 * - Unauthenticated requests must fail without leaking whether the resource
 *   exists.
 *
 * Test strategy:
 *
 * 1. Derive an unauthenticated connection from the provided connection by setting
 *    an empty headers object (no further header manipulation).
 * 2. Generate a valid UUID for `siteAdminId`.
 * 3. Attempt to fetch the admin assignment detail using the unauthenticated
 *    connection and assert that an error occurs using TestValidator.error.
 *
 * Notes:
 *
 * - Per E2E testing rules, we DO NOT assert specific HTTP status codes or error
 *   messages; we only verify that the operation fails when unauthenticated.
 */
export async function test_api_site_admin_assignment_detail_requires_admin_authentication(
  connection: api.IConnection,
) {
  // 1) Create an unauthenticated connection (do not manipulate headers beyond this point)
  const unauthenticated: api.IConnection = { ...connection, headers: {} };

  // 2) Generate a valid UUID for the target site admin assignment id
  const siteAdminId = typia.random<string & tags.Format<"uuid">>();

  // 3) Expect an error when calling with unauthenticated connection
  await TestValidator.error(
    "unauthenticated access to site admin assignment detail should fail",
    async () => {
      await api.functional.communityPlatform.siteAdmin.siteAdmins.at(
        unauthenticated,
        { siteAdminId },
      );
    },
  );
}
