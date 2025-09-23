import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformAdminAction } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformAdminAction";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";
import type { IECommunityPlatformAdminActionOrderBy } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformAdminActionOrderBy";
import type { IESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IESortDirection";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformAdminAction } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformAdminAction";

/**
 * Enforce authorization on admin actions listing for non-admin callers.
 *
 * This test validates that only system administrators can list administrative
 * actions. It performs two negative checks:
 *
 * 1. Join as a community member (non-admin) and attempt to list admin actions.
 *    Expect an authorization error.
 * 2. Create an unauthenticated connection and attempt the same call. Expect an
 *    authorization error.
 *
 * Validation rules:
 *
 * - Use typia.assert on successful join() response types.
 * - Use await TestValidator.error for negative cases (no status-code assertions).
 */
export async function test_api_admin_actions_list_authorization_enforced(
  connection: api.IConnection,
) {
  // 1) Join as a non-admin community member
  const createMemberBody = {
    username: `user_${RandomGenerator.alphabets(8)}`,
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12), // >= 8 chars
  } satisfies ICommunityPlatformCommunityMember.ICreate;

  const member: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(connection, {
      body: createMemberBody,
    });
  typia.assert(member);

  // 2) Non-admin (community member) should be denied for admin actions listing
  await TestValidator.error(
    "non-admin member cannot list admin actions",
    async () => {
      await api.functional.communityPlatform.systemAdmin.adminActions.index(
        connection,
        {
          body: {} satisfies ICommunityPlatformAdminAction.IRequest,
        },
      );
    },
  );

  // 3) Unauthenticated caller should also be denied
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "unauthenticated caller cannot list admin actions",
    async () => {
      await api.functional.communityPlatform.systemAdmin.adminActions.index(
        unauthConn,
        {
          body: {} satisfies ICommunityPlatformAdminAction.IRequest,
        },
      );
    },
  );
}
