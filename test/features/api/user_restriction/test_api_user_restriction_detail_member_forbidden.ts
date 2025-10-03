import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IClientContext } from "@ORGANIZATION/PROJECT-api/lib/structures/IClientContext";
import type { ICommunityPlatformRegisteredMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRegisteredMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";
import type { ICommunityPlatformUserRestriction } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUserRestriction";
import type { IEUserRestrictionType } from "@ORGANIZATION/PROJECT-api/lib/structures/IEUserRestrictionType";

/**
 * Member user cannot access admin-only user restriction detail.
 *
 * This test verifies that an authenticated, non-admin registered member is
 * forbidden from retrieving admin-only restriction detail records via GET
 * /communityPlatform/siteAdmin/userRestrictions/{restrictionId}.
 *
 * Steps
 *
 * 1. Register a new regular member (non-admin) using /auth/registeredMember/join
 *    and verify authorization payload typing.
 * 2. Attempt to read a user restriction detail with a random UUID as the
 *    restrictionId.
 * 3. Expect the operation to fail for non-admin members. Do not assert any
 *    specific HTTP status code or message; only that an error occurs.
 *
 * Note on simulate mode:
 *
 * - When connection.simulate === true, SDK mock returns random data and may not
 *   enforce authorization. In that case, perform a smoke call (join → admin
 *   endpoint) with typia.assert() validations and return early to avoid false
 *   negatives.
 */
export async function test_api_user_restriction_detail_member_forbidden(
  connection: api.IConnection,
) {
  // If running in SDK simulate mode, authorization may not be enforced.
  // Perform a smoke flow to validate types, then exit early.
  if (connection.simulate === true) {
    const simulatedAuth = await api.functional.auth.registeredMember.join(
      connection,
      {
        body: {
          email: typia.random<string & tags.Format<"email">>(),
          username: RandomGenerator.alphaNumeric(12),
          password: RandomGenerator.alphaNumeric(12),
          displayName: RandomGenerator.name(),
          client: {
            userAgent: `e2e/${RandomGenerator.alphaNumeric(6)}`,
            clientPlatform: "e2e-tests",
            sessionType: "standard",
          },
        } satisfies ICommunityPlatformRegisteredMember.IJoin,
      },
    );
    typia.assert(simulatedAuth);

    const simulatedAdminRead =
      await api.functional.communityPlatform.siteAdmin.userRestrictions.at(
        connection,
        {
          restrictionId: typia.random<string & tags.Format<"uuid">>(),
        },
      );
    typia.assert(simulatedAdminRead);
    return;
  }

  // 1) Register a new member (non-admin)
  const member = await api.functional.auth.registeredMember.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      username: RandomGenerator.alphaNumeric(12),
      password: RandomGenerator.alphaNumeric(12),
      displayName: RandomGenerator.name(),
      client: {
        userAgent: `e2e/${RandomGenerator.alphaNumeric(6)}`,
        clientPlatform: "e2e-tests",
        sessionType: "standard",
      },
    } satisfies ICommunityPlatformRegisteredMember.IJoin,
  });
  typia.assert(member);
  TestValidator.predicate(
    "member session established (access token present)",
    member.token.access.length > 0,
  );

  // 2) Attempt to access admin-only restriction detail → should fail
  await TestValidator.error(
    "non-admin member cannot access site admin user restriction detail",
    async () => {
      await api.functional.communityPlatform.siteAdmin.userRestrictions.at(
        connection,
        {
          restrictionId: typia.random<string & tags.Format<"uuid">>(),
        },
      );
    },
  );
}
