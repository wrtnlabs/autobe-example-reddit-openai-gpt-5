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
 * List Site Admin assignments with deterministic sorting and page structure.
 *
 * Business flow
 *
 * 1. Create three distinct site admins (Admin A/B/C) via join endpoint. The SDK
 *    auto-authenticates after each join, so the connection remains
 *    authenticated as the last joined admin.
 * 2. Call listing API with active_only=true and explicit sort_by/order to enforce
 *    visibility and deterministic ordering (granted_at DESC, id DESC).
 * 3. Validate:
 *
 *    - Response schema (typia.assert on page object)
 *    - Pagination block presence and simple logical consistency
 *    - The three newly created admins appear in results (by userId)
 *    - All items exclude deleted rows (deletedAt is null/undefined)
 *    - Ordering is non-increasing by grantedAt; for equal grantedAt, id DESC
 */
export async function test_api_site_admin_assignments_listing_by_admin_with_sorting(
  connection: api.IConnection,
) {
  // Helper: generate unique and valid admin join input
  const createJoinInput = () => {
    const userTag = `${RandomGenerator.alphabets(6)}${RandomGenerator.alphaNumeric(6)}`; // ensures uniqueness
    const email = `${userTag}@example.com`;
    const username = `${RandomGenerator.alphaNumeric(8)}${RandomGenerator.alphabets(2)}`; // 10 chars, start/end alnum
    const password = `${RandomGenerator.alphaNumeric(12)}`; // >= 8 chars
    const input = {
      email,
      username,
      password,
      // displayName omitted (optional)
    } satisfies ICommunityPlatformSiteAdminJoin.ICreate;
    return input;
  };

  // 1) Create three admins (A, B, C)
  const adminA: ICommunityPlatformSiteAdmin.IAuthorized =
    await api.functional.auth.siteAdmin.join(connection, {
      body: createJoinInput(),
    });
  typia.assert(adminA);

  const adminB: ICommunityPlatformSiteAdmin.IAuthorized =
    await api.functional.auth.siteAdmin.join(connection, {
      body: createJoinInput(),
    });
  typia.assert(adminB);

  const adminC: ICommunityPlatformSiteAdmin.IAuthorized =
    await api.functional.auth.siteAdmin.join(connection, {
      body: createJoinInput(),
    });
  typia.assert(adminC);

  // Collect the created userIds for verification
  const createdUserIds: (string & tags.Format<"uuid">)[] = [
    adminA.userId,
    adminB.userId,
    adminC.userId,
  ];

  // 2) List site admin assignments with explicit sorting and visibility control
  const page =
    await api.functional.communityPlatform.siteAdmin.siteAdmins.index(
      connection,
      {
        body: {
          active_only: true,
          sort_by: "granted_at",
          order: "desc",
        } satisfies ICommunityPlatformSiteAdmin.IRequest,
      },
    );
  typia.assert(page);

  // 3) Validations -----------------------------------------------------------
  // 3-1) Ensure page structure and basic logical consistency
  TestValidator.predicate(
    "pagination block exists and has non-negative records/pages",
    page.pagination.records >= 0 && page.pagination.pages >= 0,
  );
  TestValidator.predicate(
    "data length does not exceed limit",
    page.data.length <= page.pagination.limit,
  );

  // 3-2) The created admins should appear on the latest-first page
  const returnedUserIds = new Set(page.data.map((r) => r.userId));
  TestValidator.predicate(
    "first page includes all recently created admin assignments",
    createdUserIds.every((uid) => returnedUserIds.has(uid)),
  );

  // 3-3) Visibility: active_only=true excludes soft-deleted rows
  for (const row of page.data) {
    TestValidator.predicate(
      `deletedAt must be null/undefined for assignment ${row.id}`,
      row.deletedAt === null || row.deletedAt === undefined,
    );
  }

  // 3-4) Ordering: grantedAt DESC, then id DESC for tie-breaker
  const isDesc = (a: string, b: string) => a >= b; // ISO date-time lexicographic DESC check
  for (let i = 1; i < page.data.length; i++) {
    const prev = page.data[i - 1];
    const curr = page.data[i];
    // primary key: grantedAt desc
    if (prev.grantedAt !== curr.grantedAt) {
      TestValidator.predicate(
        `grantedAt must be non-increasing at index ${i}`,
        isDesc(prev.grantedAt, curr.grantedAt),
      );
    } else {
      // tie-breaker: id desc
      TestValidator.predicate(
        `id must be non-increasing when grantedAt ties at index ${i}`,
        prev.id >= curr.id,
      );
    }
  }
}
