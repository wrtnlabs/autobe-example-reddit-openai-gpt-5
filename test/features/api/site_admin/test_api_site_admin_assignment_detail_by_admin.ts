import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformSiteAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSiteAdmin";
import type { ICommunityPlatformSiteAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSiteAdminJoin";
import type { IECommunityPlatformSiteAdminSort } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformSiteAdminSort";
import type { IEOrderDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IEOrderDirection";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformSiteAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformSiteAdmin";

/**
 * Site Admin assignment detail fetch by an authenticated admin.
 *
 * This test verifies that:
 *
 * 1. An admin can authenticate via join and the SDK attaches the token.
 * 2. The admin can list their site-admin assignments using the listing API
 *    filtered by their community platform user id to discover a concrete id.
 * 3. The admin can fetch the detail of that assignment using the discovered id.
 * 4. The detail matches the summary fields for id/userId/grantedAt.
 * 5. Active-only listing implies revokedAt and deletedAt are null/undefined.
 * 6. Guest guard: unauthenticated request to the detail endpoint fails.
 * 7. Not-found path: a random non-existent UUID fails.
 */
export async function test_api_site_admin_assignment_detail_by_admin(
  connection: api.IConnection,
) {
  // 1) Authenticate by creating a site admin (join)
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    // Username pattern: ^[A-Za-z0-9](?:[A-Za-z0-9_-]{1,28}[A-Za-z0-9])?$
    // Build a safe 10~14 length, alphanumeric start/end string
    username: `adm${RandomGenerator.alphaNumeric(8)}`,
    password: RandomGenerator.alphaNumeric(12),
    displayName: RandomGenerator.name(),
  } satisfies ICommunityPlatformSiteAdminJoin.ICreate;
  const authorized = await api.functional.auth.siteAdmin.join(connection, {
    body: joinBody,
  });
  typia.assert(authorized);
  // Token is attached by SDK; avoid touching connection.headers here.

  // 2) Discover a target siteAdminId by listing assignments for this user
  const page =
    await api.functional.communityPlatform.siteAdmin.siteAdmins.index(
      connection,
      {
        body: {
          community_platform_user_id: authorized.userId,
          active_only: true,
        } satisfies ICommunityPlatformSiteAdmin.IRequest,
      },
    );
  typia.assert(page);

  TestValidator.predicate(
    "listing for current admin user should return at least one assignment",
    page.data.length >= 1,
  );

  const target = page.data[0];
  // 3) Fetch detail by discovered id
  const detail = await api.functional.communityPlatform.siteAdmin.siteAdmins.at(
    connection,
    { siteAdminId: target.id },
  );
  typia.assert(detail);

  // 4) Cross-check fields with summary
  TestValidator.equals("detail.id equals summary.id", detail.id, target.id);
  TestValidator.equals(
    "detail.userId equals summary.userId",
    detail.userId,
    target.userId,
  );
  TestValidator.equals(
    "detail.grantedAt equals summary.grantedAt",
    detail.grantedAt,
    target.grantedAt,
  );

  // 5) Active-only listing implies non-revoked & non-deleted
  TestValidator.predicate(
    "active grant has revokedAt null/undefined",
    detail.revokedAt === null || detail.revokedAt === undefined,
  );
  TestValidator.predicate(
    "active grant has deletedAt null/undefined",
    detail.deletedAt === null || detail.deletedAt === undefined,
  );

  // 6) Guest guard: unauthenticated request must fail
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "unauthenticated access to detail should fail",
    async () => {
      await api.functional.communityPlatform.siteAdmin.siteAdmins.at(
        unauthConn,
        { siteAdminId: target.id },
      );
    },
  );

  // 7) Not found: call with a random non-existent UUID should fail
  const existingIds = new Set(page.data.map((s) => s.id));
  let missingId = typia.random<string & tags.Format<"uuid">>();
  while (existingIds.has(missingId) || missingId === detail.id) {
    missingId = typia.random<string & tags.Format<"uuid">>();
  }
  await TestValidator.error("non-existent id should fail", async () => {
    await api.functional.communityPlatform.siteAdmin.siteAdmins.at(connection, {
      siteAdminId: missingId,
    });
  });
}
