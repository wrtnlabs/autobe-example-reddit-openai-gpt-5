import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformSiteAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSiteAdmin";
import type { ICommunityPlatformSiteAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSiteAdminJoin";

/**
 * Verify site admin registration enforces case-insensitive uniqueness.
 *
 * Steps:
 *
 * 1. Register a new site admin with unique email and username.
 * 2. Attempt registering again using same identifiers but different casing.
 * 3. Expect the second attempt to fail, demonstrating case-insensitive uniqueness.
 *
 * Notes:
 *
 * - Uses only the provided join API; validates success then duplicate-error.
 * - Avoids touching headers; SDK manages Authorization automatically.
 * - No HTTP status/message assertions; only error existence is checked.
 */
export async function test_api_site_admin_registration_uniqueness_conflict(
  connection: api.IConnection,
) {
  // Helper to alternate case for case-insensitive uniqueness testing
  const varyCase = (input: string): string =>
    Array.from(input)
      .map((ch, idx) => (idx % 2 === 0 ? ch.toUpperCase() : ch.toLowerCase()))
      .join("");

  // Generate compliant username (3-30, alnum start/end; we'll use pure alnum)
  const base = RandomGenerator.alphaNumeric(10); // letters/digits
  const username = `${base}`; // starts/ends alnum, middle alnum only -> fits pattern
  const usernameVariant = varyCase(username);

  // Construct a deterministic email to create a case variant
  const local = `admin_${RandomGenerator.alphaNumeric(8)}`;
  const domain = "example.com";
  const email = `${local}@${domain}`;
  const emailVariant = `${varyCase(local)}@${varyCase(domain)}`;

  // Strong password within 8-128
  const password1 = RandomGenerator.alphaNumeric(12);
  const password2 = RandomGenerator.alphaNumeric(12);

  // Optional display name
  const displayName = RandomGenerator.name(1);

  // 1) Successful registration
  const first = await api.functional.auth.siteAdmin.join(connection, {
    body: {
      email,
      username,
      password: password1,
      displayName,
    } satisfies ICommunityPlatformSiteAdminJoin.ICreate,
  });
  typia.assert<ICommunityPlatformSiteAdmin.IAuthorized>(first);

  // 2) Duplicate registration with different casing should fail
  await TestValidator.error(
    "duplicate admin registration using case-variant identifiers must fail",
    async () => {
      await api.functional.auth.siteAdmin.join(connection, {
        body: {
          email: emailVariant,
          username: usernameVariant,
          password: password2,
          displayName,
        } satisfies ICommunityPlatformSiteAdminJoin.ICreate,
      });
    },
  );
}
