import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IClientContext } from "@ORGANIZATION/PROJECT-api/lib/structures/IClientContext";
import type { ICommunityPlatformRegisteredMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRegisteredMember";
import type { ICommunityPlatformSiteAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSiteAdmin";
import type { ICommunityPlatformSiteAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSiteAdminJoin";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";
import type { IECommunityPlatformUserSortBy } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformUserSortBy";
import type { IEOrderDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IEOrderDirection";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformUser";

export async function test_api_site_admin_user_index_search_sort_pagination(
  connection: api.IConnection,
) {
  /**
   * Validate admin-only user listing with search, sorting, and pagination.
   *
   * Steps:
   *
   * 1. Create a site admin (admin token on main connection)
   * 2. Seed multiple registered members using a separate connection so the admin
   *    token remains intact
   * 3. Negative guards: unauthenticated and member token cannot access admin
   *    listing
   * 4. Default listing: validate structure and default limit behavior
   * 5. Sorting: createdAt DESC, username ASC; verify deterministic ordering
   * 6. Search: filter by username (case-insensitive exact)
   */

  // 1) Site admin joins (main connection keeps admin token)
  const adminEmail = typia.random<string & tags.Format<"email">>();
  const adminUsername = `adm_${RandomGenerator.alphaNumeric(8)}`; // matches pattern, starts with alpha and ends with alnum
  const adminAuth = await api.functional.auth.siteAdmin.join(connection, {
    body: {
      email: adminEmail,
      username: adminUsername,
      password: "Adm!nPassw0rd",
      displayName: RandomGenerator.name(1),
    } satisfies ICommunityPlatformSiteAdminJoin.ICreate,
  });
  typia.assert<ICommunityPlatformSiteAdmin.IAuthorized>(adminAuth);

  // Keep admin-authenticated main connection intact; use a separate connection when creating members
  const memberConn: api.IConnection = { ...connection, headers: {} };

  // 2) Seed registered members with diverse usernames/emails
  const MEMBER_COUNT = 25; // exceed 20 to exercise pagination sizing
  const seeded = await ArrayUtil.asyncRepeat(MEMBER_COUNT, async (i) => {
    const email = typia.random<string & tags.Format<"email">>();
    const username = `user_${RandomGenerator.alphaNumeric(10)}`; // human readable, unique-ish
    const output = await api.functional.auth.registeredMember.join(memberConn, {
      body: {
        email,
        username,
        password: "Memb3rPass!",
        displayName: RandomGenerator.name(1),
      } satisfies ICommunityPlatformRegisteredMember.IJoin,
    });
    typia.assert<ICommunityPlatformRegisteredMember.IAuthorized>(output);
    return { email, username, id: output.id };
  });

  // Choose a random seeded user for search filter checks
  const target = seeded[Math.floor(Math.random() * seeded.length)];

  // 3) Negative: unauthenticated cannot access
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error("unauthenticated cannot list users", async () => {
    await api.functional.communityPlatform.siteAdmin.users.index(unauthConn, {
      body: {} satisfies ICommunityPlatformUser.IRequest,
    });
  });

  // 3) Negative: member token (non-admin) cannot access
  await TestValidator.error(
    "member token cannot list admin users",
    async () => {
      await api.functional.communityPlatform.siteAdmin.users.index(memberConn, {
        body: {} satisfies ICommunityPlatformUser.IRequest,
      });
    },
  );

  // Helper: compare function for ISO timestamps (descending)
  const isNonIncreasingDate = (arr: { created_at: string }[]): boolean => {
    for (let i = 1; i < arr.length; i++) {
      const prev = new Date(arr[i - 1].created_at).getTime();
      const curr = new Date(arr[i].created_at).getTime();
      if (prev < curr) return false; // must be non-increasing
    }
    return true;
  };

  // Helper: case-insensitive username ascending validation
  const isUsernameAsc = (arr: { username: string }[]): boolean => {
    for (let i = 1; i < arr.length; i++) {
      const a = arr[i - 1].username.toLowerCase();
      const b = arr[i].username.toLowerCase();
      if (a > b) return false;
    }
    return true;
  };

  // 4) Default listing with minimal request; validate structure and default limit
  const firstPage =
    await api.functional.communityPlatform.siteAdmin.users.index(connection, {
      body: {} satisfies ICommunityPlatformUser.IRequest,
    });
  typia.assert<IPageICommunityPlatformUser.ISummary>(firstPage);
  TestValidator.predicate(
    "default listing returns up to pagination.limit records",
    firstPage.data.length <= firstPage.pagination.limit,
  );
  // Check declared default limit (20) if respected by implementation
  TestValidator.equals("default limit is 20", firstPage.pagination.limit, 20);

  // 5) Sorting checks: createdAt DESC
  const byCreatedDesc =
    await api.functional.communityPlatform.siteAdmin.users.index(connection, {
      body: {
        sortBy: "createdAt",
        order: "desc",
        limit: 50,
      } satisfies ICommunityPlatformUser.IRequest,
    });
  typia.assert<IPageICommunityPlatformUser.ISummary>(byCreatedDesc);
  TestValidator.predicate(
    "createdAt DESC ordering is non-increasing",
    isNonIncreasingDate(byCreatedDesc.data),
  );

  // Determinism: same request yields identical id sequence
  const byCreatedDescAgain =
    await api.functional.communityPlatform.siteAdmin.users.index(connection, {
      body: {
        sortBy: "createdAt",
        order: "desc",
        limit: 50,
      } satisfies ICommunityPlatformUser.IRequest,
    });
  typia.assert<IPageICommunityPlatformUser.ISummary>(byCreatedDescAgain);
  TestValidator.equals(
    "identical requests return identical sequences",
    byCreatedDesc.data.map((u) => u.id),
    byCreatedDescAgain.data.map((u) => u.id),
  );

  // 5) Sorting checks: username ASC (case-insensitive)
  const byUsernameAsc =
    await api.functional.communityPlatform.siteAdmin.users.index(connection, {
      body: {
        sortBy: "username",
        order: "asc",
        limit: 50,
      } satisfies ICommunityPlatformUser.IRequest,
    });
  typia.assert<IPageICommunityPlatformUser.ISummary>(byUsernameAsc);
  TestValidator.predicate(
    "username ASC ordering is monotonic (case-insensitive)",
    isUsernameAsc(byUsernameAsc.data),
  );

  // 6) Search by username (exact / case-insensitive)
  const byUsernameFilter =
    await api.functional.communityPlatform.siteAdmin.users.index(connection, {
      body: {
        username: target.username,
        limit: 100,
      } satisfies ICommunityPlatformUser.IRequest,
    });
  typia.assert<IPageICommunityPlatformUser.ISummary>(byUsernameFilter);
  TestValidator.predicate(
    "username filter returns only matching usernames (CI)",
    byUsernameFilter.data.every(
      (u) => u.username.toLowerCase() === target.username.toLowerCase(),
    ),
  );
  // Ensure the seeded target exists in results
  TestValidator.predicate(
    "seeded target present in username-filtered results",
    byUsernameFilter.data.some(
      (u) => u.username.toLowerCase() === target.username.toLowerCase(),
    ),
  );
}
