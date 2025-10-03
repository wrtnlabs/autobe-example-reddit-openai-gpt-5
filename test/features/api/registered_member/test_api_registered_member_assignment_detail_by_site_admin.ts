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
import type { IECommunityPlatformRegisteredMemberSort } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformRegisteredMemberSort";
import type { IEOrderDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IEOrderDirection";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformRegisteredMember } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformRegisteredMember";

/**
 * SiteAdmin can fetch Registered Member assignment detail by ID.
 *
 * Steps:
 *
 * 1. Join as Site Admin (auto-auth) to set admin token
 * 2. Join a new Registered Member (auto-auth switches to member token)
 * 3. Switch back to admin by joining another Site Admin (token switches)
 * 4. List registered members filtered by the created member's user ID
 * 5. Fetch detail by the discovered registeredMemberId
 *
 * Validations:
 *
 * - All responses asserted via typia.assert()
 * - Listing includes at least one record for the target user
 * - Detail.id equals listed summary.id
 * - Detail.community_platform_user_id equals the created member id
 * - Detail.deleted_at is null or undefined (active record)
 * - Optional: created_at equals summary.createdAt
 */
export async function test_api_registered_member_assignment_detail_by_site_admin(
  connection: api.IConnection,
) {
  // 1) Site Admin join (admin A)
  const adminEmailA: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const adminJoinA = await api.functional.auth.siteAdmin.join(connection, {
    body: {
      email: adminEmailA,
      username: `admin${RandomGenerator.alphaNumeric(8)}`,
      password: RandomGenerator.alphaNumeric(12),
      displayName: RandomGenerator.name(),
    } satisfies ICommunityPlatformSiteAdminJoin.ICreate,
  });
  typia.assert(adminJoinA);

  // 2) Registered Member join (creates assignment implicitly) – switches token to member
  const memberEmail: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const memberUsername = `member${RandomGenerator.alphaNumeric(8)}`; // starts/ends alnum, len<=30
  const memberClient: IClientContext = {
    userAgent: `e2e/${RandomGenerator.alphaNumeric(6)}`,
    ip: "127.0.0.1",
    clientPlatform: "node-e2e",
    clientDevice: "ci-runner",
    sessionType: "standard",
  };
  const memberJoin = await api.functional.auth.registeredMember.join(
    connection,
    {
      body: {
        email: memberEmail,
        username: memberUsername,
        password: RandomGenerator.alphaNumeric(12),
        displayName: RandomGenerator.name(),
        client: memberClient,
      } satisfies ICommunityPlatformRegisteredMember.IJoin,
    },
  );
  typia.assert(memberJoin);

  // Keep the created member's user id for filtering
  const memberUserId: string & tags.Format<"uuid"> = memberJoin.id;

  // 3) Switch back to admin by joining another admin (admin B)
  const adminEmailB: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const adminJoinB = await api.functional.auth.siteAdmin.join(connection, {
    body: {
      email: adminEmailB,
      username: `admin${RandomGenerator.alphaNumeric(9)}`,
      password: RandomGenerator.alphaNumeric(12),
      displayName: RandomGenerator.name(),
    } satisfies ICommunityPlatformSiteAdminJoin.ICreate,
  });
  typia.assert(adminJoinB);

  // 4) List registered members filtered by the created member's user id
  const page =
    await api.functional.communityPlatform.siteAdmin.registeredMembers.index(
      connection,
      {
        body: {
          community_platform_user_id: memberUserId,
          active_only: true,
          sort_by: "created_at",
          order: "desc",
          limit: 20,
        } satisfies ICommunityPlatformRegisteredMember.IRequest,
      },
    );
  typia.assert(page);

  TestValidator.predicate(
    "listing contains the member's assignment",
    page.data.length >= 1,
  );

  const summary = page.data[0];
  // Sanity: summary.userId must match the created member's user id
  TestValidator.equals(
    "summary.userId equals member user id",
    summary.userId,
    memberUserId,
  );

  // 5) Fetch detail by registeredMemberId
  const detail =
    await api.functional.communityPlatform.siteAdmin.registeredMembers.at(
      connection,
      { registeredMemberId: summary.id },
    );
  typia.assert(detail);

  // Core validations
  TestValidator.equals(
    "detail.id equals listed summary.id",
    detail.id,
    summary.id,
  );
  TestValidator.equals(
    "detail.community_platform_user_id equals created member id",
    detail.community_platform_user_id,
    memberUserId,
  );
  TestValidator.predicate(
    "active record has deleted_at null or undefined",
    detail.deleted_at === null || detail.deleted_at === undefined,
  );

  // Optional cross-check for created_at timestamp parity
  TestValidator.equals(
    "created_at equals summary.createdAt",
    detail.created_at,
    summary.createdAt,
  );
}
