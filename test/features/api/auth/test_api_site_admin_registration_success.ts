import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformSiteAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSiteAdmin";
import type { ICommunityPlatformSiteAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSiteAdminJoin";

/**
 * Site Admin registration happy path with duplicate-join rejection.
 *
 * Purpose
 *
 * - Ensure a brand-new Site Administrator can register via POST
 *   /auth/siteAdmin/join receiving an authorization payload with a usable
 *   access/refresh token.
 * - Verify uniqueness constraints by attempting the same registration again and
 *   expecting a business-rule error (duplicate email/username).
 *
 * Steps
 *
 * 1. Generate unique, format-compliant inputs: email, username, password,
 *    displayName.
 * 2. Call join and validate response shape with typia.assert.
 * 3. Business checks: token strings are non-empty; if admin profile is present, it
 *    matches the returned userId and is not revoked.
 * 4. Attempt duplicate join with the exact same payload and expect an error.
 */
export async function test_api_site_admin_registration_success(
  connection: api.IConnection,
) {
  // 1) Prepare unique inputs matching DTO constraints
  const suffix: string = RandomGenerator.alphaNumeric(8);
  const email: string = `admin+${suffix}@example.com`;
  const username: string = `adm${RandomGenerator.alphaNumeric(12)}`; // 3+ chars, alnum start/end
  const password: string = RandomGenerator.alphaNumeric(12); // 8-128
  const displayName: string = RandomGenerator.name(); // <=64 very likely

  const joinBody = {
    email,
    username,
    password,
    displayName,
  } satisfies ICommunityPlatformSiteAdminJoin.ICreate;

  // 2) Execute join and assert response type
  const authorized = await api.functional.auth.siteAdmin.join(connection, {
    body: joinBody,
  });
  typia.assert(authorized);

  // 3) Business validations (not type validations)
  TestValidator.predicate(
    "access token should be a non-empty string",
    authorized.token.access.length > 0,
  );
  TestValidator.predicate(
    "refresh token should be a non-empty string",
    authorized.token.refresh.length > 0,
  );

  if (authorized.admin !== undefined) {
    // Narrow and validate relationship expectations
    typia.assertGuard(authorized.admin!);
    TestValidator.equals(
      "admin.userId must equal authorized.userId when profile is present",
      authorized.admin.userId,
      authorized.userId,
    );
    TestValidator.predicate(
      "admin grant should not be revoked at creation time (revokedAt null/undefined)",
      authorized.admin.revokedAt === null ||
        authorized.admin.revokedAt === undefined,
    );
  }

  // 4) Duplicate join should fail (uniqueness)
  await TestValidator.error(
    "duplicate join with same email/username must be rejected",
    async () => {
      await api.functional.auth.siteAdmin.join(connection, { body: joinBody });
    },
  );
}
