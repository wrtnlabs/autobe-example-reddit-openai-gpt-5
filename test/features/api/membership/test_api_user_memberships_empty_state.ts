import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IClientContext } from "@ORGANIZATION/PROJECT-api/lib/structures/IClientContext";
import type { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformRegisteredMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRegisteredMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

/**
 * Verify empty memberships listing for a freshly registered user.
 *
 * Steps:
 *
 * 1. Register a new member via POST /auth/registeredMember/join and capture the
 *    returned user id.
 * 2. With the authenticated connection, call GET
 *    /communityPlatform/registeredMember/users/{userId}/memberships.
 * 3. Validate that the response shape is correct and that the memberships list is
 *    empty for this new user.
 * 4. Negative (guest guard): from an unauthenticated connection, the memberships
 *    listing should raise an error.
 */
export async function test_api_user_memberships_empty_state(
  connection: api.IConnection,
) {
  // 1) Register a new member
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    username: `user_${RandomGenerator.alphaNumeric(12)}`,
    password: `Pw_${RandomGenerator.alphaNumeric(12)}`,
    displayName: RandomGenerator.name(),
    client: {
      userAgent: "e2e-tests/1.0",
      clientPlatform: "node-e2e",
      sessionType: "standard",
    },
  } satisfies ICommunityPlatformRegisteredMember.IJoin;

  const authorized: ICommunityPlatformRegisteredMember.IAuthorized =
    await api.functional.auth.registeredMember.join(connection, {
      body: joinBody,
    });
  typia.assert(authorized);

  // Sanity: if user summary returned, ensure id matches
  if (authorized.user !== undefined) {
    TestValidator.equals(
      "authorized.user.id should match authorized.id",
      authorized.user.id,
      authorized.id,
    );
  }

  // 2) List memberships for the new user
  const memberships =
    await api.functional.communityPlatform.registeredMember.users.memberships.index(
      connection,
      { userId: authorized.id },
    );
  typia.assert(memberships);

  // 3) Validate empty state
  TestValidator.equals(
    "memberships data should be empty for a new user",
    memberships.data,
    [],
  );
  TestValidator.equals(
    "memberships list length should be zero",
    memberships.data.length,
    0,
  );

  // 4) Guest guard: unauthenticated request should fail
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error("guest cannot list memberships", async () => {
    await api.functional.communityPlatform.registeredMember.users.memberships.index(
      unauthConn,
      { userId: authorized.id },
    );
  });
}
