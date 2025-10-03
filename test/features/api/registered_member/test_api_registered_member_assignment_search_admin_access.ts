import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformRegisteredMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRegisteredMember";
import type { ICommunityPlatformSiteAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSiteAdmin";
import type { ICommunityPlatformSiteAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSiteAdminJoin";
import type { IECommunityPlatformRegisteredMemberSort } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformRegisteredMemberSort";
import type { IEOrderDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IEOrderDirection";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformRegisteredMember } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformRegisteredMember";

/**
 * Admin can list/search registered member assignments with deterministic
 * ordering.
 *
 * Workflow:
 *
 * 1. Create a new Site Admin (auto-authenticates the connection).
 * 2. Call PATCH /communityPlatform/siteAdmin/registeredMembers with explicit
 *    sort_by "created_at" and order "desc" and a small limit, then validate:
 *
 *    - Response typing via typia.assert
 *    - Stable ordering (createdAt DESC, id DESC tiebreaker) when 2+ items
 *    - Pagination metadata is coherent with page size
 * 3. Call the same listing with a smaller limit and verify prefix consistency
 *    across the two calls (first K items are identical by id).
 *
 * Notes:
 *
 * - Dataset may be empty; ordering checks run only when data.length >= 2.
 * - No resource creation APIs for registered members are provided here, so the
 *   test focuses on read semantics, ordering and pagination stability.
 */
export async function test_api_registered_member_assignment_search_admin_access(
  connection: api.IConnection,
) {
  // 1) Site Admin join (auto attaches token to connection)
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    username: RandomGenerator.alphaNumeric(10),
    password: RandomGenerator.alphaNumeric(12),
    displayName: RandomGenerator.name(1),
  } satisfies ICommunityPlatformSiteAdminJoin.ICreate;
  const admin = await api.functional.auth.siteAdmin.join(connection, {
    body: joinBody,
  });
  typia.assert(admin);

  // 2) First listing call (created_at DESC, id DESC tie)
  const requestA = {
    sort_by: "created_at" as IECommunityPlatformRegisteredMemberSort,
    order: "desc" as IEOrderDirection,
    limit: 10,
  } satisfies ICommunityPlatformRegisteredMember.IRequest;
  const pageA =
    await api.functional.communityPlatform.siteAdmin.registeredMembers.index(
      connection,
      { body: requestA },
    );
  typia.assert(pageA);

  // Basic pagination sanity: result count <= limit
  TestValidator.predicate(
    "pageA data length must not exceed requested limit",
    pageA.data.length <= requestA.limit!,
  );

  // Ordering validation helper (createdAt DESC, id DESC tie)
  const assertCreatedAtThenIdDesc = (
    title: string,
    list: ICommunityPlatformRegisteredMember.ISummary[],
  ) => {
    for (let i = 0; i + 1 < list.length; i++) {
      const a = list[i]!;
      const b = list[i + 1]!;
      const cond =
        a.createdAt > b.createdAt ||
        (a.createdAt === b.createdAt && a.id >= b.id);
      TestValidator.predicate(`${title} [${i}→${i + 1}] order`, cond);
    }
  };

  // Business rule coherence helper: isActive === (deletedAt == null)
  const assertIsActiveCoherence = (
    title: string,
    list: ICommunityPlatformRegisteredMember.ISummary[],
  ) => {
    for (let i = 0; i < list.length; i++) {
      const it = list[i]!;
      const activeMeans = it.deletedAt === null || it.deletedAt === undefined;
      TestValidator.equals(
        `${title} isActive coherence [${i}]`,
        it.isActive,
        activeMeans,
      );
    }
  };

  if (pageA.data.length >= 2) {
    assertCreatedAtThenIdDesc(
      "createdAt desc with id desc tie-breaker (pageA)",
      pageA.data,
    );
  }
  // Validate business rule for all items (if any)
  if (pageA.data.length > 0) {
    assertIsActiveCoherence("pageA", pageA.data);
  }

  // 3) Second listing with smaller limit to validate prefix consistency
  const requestB = {
    sort_by: "created_at" as IECommunityPlatformRegisteredMemberSort,
    order: "desc" as IEOrderDirection,
    limit: 5,
  } satisfies ICommunityPlatformRegisteredMember.IRequest;
  const pageB =
    await api.functional.communityPlatform.siteAdmin.registeredMembers.index(
      connection,
      { body: requestB },
    );
  typia.assert(pageB);

  // prefix consistency: first K ids of pageA must equal all ids of pageB when K == pageB.data.length
  const k = Math.min(pageA.data.length, pageB.data.length);
  const prefixA = pageA.data.slice(0, k).map((r) => r.id);
  const idsB = pageB.data.map((r) => r.id);
  TestValidator.equals(
    "prefix consistency on ids between different limits",
    idsB,
    prefixA,
  );

  // Re-run ordering and coherence checks for pageB
  if (pageB.data.length >= 2) {
    assertCreatedAtThenIdDesc(
      "createdAt desc with id desc tie-breaker (pageB)",
      pageB.data,
    );
  }
  if (pageB.data.length > 0) {
    assertIsActiveCoherence("pageB", pageB.data);
  }
}
