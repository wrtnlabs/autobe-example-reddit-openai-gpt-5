import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IClientContext } from "@ORGANIZATION/PROJECT-api/lib/structures/IClientContext";
import type { ICommunityPlatformRegisteredMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRegisteredMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";
import type { ICommunityPlatformUserRestriction } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUserRestriction";
import type { IEOrderDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IEOrderDirection";
import type { IEUserRestrictionSortBy } from "@ORGANIZATION/PROJECT-api/lib/structures/IEUserRestrictionSortBy";
import type { IEUserRestrictionType } from "@ORGANIZATION/PROJECT-api/lib/structures/IEUserRestrictionType";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformUserRestriction } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformUserRestriction";

/**
 * Member cannot access admin-only user restriction search.
 *
 * Purpose
 *
 * - Ensure role-based access control (RBAC) denies a non-admin registered member
 *   from accessing the administrative user restriction search endpoint.
 *
 * Steps
 *
 * 1. Register a new member via /auth/registeredMember/join to obtain an
 *    authenticated session (SDK stores token on the connection automatically).
 * 2. Attempt to call PATCH /communityPlatform/siteAdmin/userRestrictions with the
 *    member-authenticated connection using a valid request body.
 * 3. Expect the call to fail; only assert that an error occurs (do not validate
 *    specific HTTP status codes or messages per E2E rules).
 */
export async function test_api_user_restriction_search_member_forbidden(
  connection: api.IConnection,
) {
  // 1) Register a new member (non-admin)
  const authorized = await api.functional.auth.registeredMember.join(
    connection,
    {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        username: RandomGenerator.name(1),
        password: "P@ssw0rd!",
        displayName: RandomGenerator.name(),
        client: {
          userAgent: `e2e/${RandomGenerator.alphaNumeric(6)}`,
          clientPlatform: "web",
          clientDevice: "chrome",
          ip: "127.0.0.1",
          sessionType: "standard",
        },
      } satisfies ICommunityPlatformRegisteredMember.IJoin,
    },
  );
  typia.assert(authorized);

  // 2) Attempt admin-only search as the member, expect error
  await TestValidator.error(
    "member cannot access admin-only user restriction search",
    async () => {
      await api.functional.communityPlatform.siteAdmin.userRestrictions.index(
        connection,
        {
          body: {
            activeOnly: true,
            userId: authorized.id,
            sortBy: "createdAt",
            order: "desc",
          } satisfies ICommunityPlatformUserRestriction.IRequest,
        },
      );
    },
  );
}
