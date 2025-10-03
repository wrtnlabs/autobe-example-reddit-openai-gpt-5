import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IClientContext } from "@ORGANIZATION/PROJECT-api/lib/structures/IClientContext";
import type { ICommunityPlatformRegisteredMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRegisteredMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

/**
 * Verify single-session logout revokes the active session and is idempotent.
 *
 * Steps
 *
 * 1. Register a new member to obtain an authenticated session (join)
 * 2. Sanity-check the session by calling a protected endpoint (me)
 * 3. Logout the current session and validate result payload
 * 4. Confirm protected endpoint now fails with the revoked token
 * 5. Call logout again to verify idempotency and stable session reference
 */
export async function test_api_auth_logout_current_session_revocation(
  connection: api.IConnection,
) {
  // 1) Register a new member and obtain an authenticated session
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    username: RandomGenerator.alphaNumeric(12),
    password: "P@ssw0rd!e2e",
    displayName: RandomGenerator.name(2),
    client: {
      userAgent: `e2e-test/${RandomGenerator.alphaNumeric(8)}`,
      clientPlatform: "node-e2e",
      clientDevice: "test-runner",
    },
  } satisfies ICommunityPlatformRegisteredMember.IJoin;
  const authorized = await api.functional.auth.registeredMember.join(
    connection,
    {
      body: joinBody,
    },
  );
  typia.assert(authorized);

  // 2) Sanity-check: authenticated read must succeed before logout
  const meBefore =
    await api.functional.communityPlatform.registeredMember.me.at(connection);
  typia.assert(meBefore);
  TestValidator.equals(
    "profile id equals authorized id before logout",
    meBefore.id,
    authorized.id,
  );

  // 3) Logout the current session
  const logoutRequest = {
    userAgent: `e2e-test/${RandomGenerator.alphaNumeric(8)}`,
    clientPlatform: "node-e2e",
    clientDevice: "test-runner",
  } satisfies ICommunityPlatformRegisteredMember.ILogoutRequest;
  const firstLogout = await api.functional.auth.registeredMember.logout(
    connection,
    { body: logoutRequest },
  );
  typia.assert(firstLogout);
  TestValidator.predicate(
    "first logout status is valid",
    firstLogout.status === "revoked" ||
      firstLogout.status === "already_revoked",
  );

  // 4) Protected endpoint should fail after logout
  await TestValidator.error(
    "protected 'me' endpoint must be unauthorized after logout",
    async () => {
      await api.functional.communityPlatform.registeredMember.me.at(connection);
    },
  );

  // 5) Call logout again to confirm idempotency
  const secondLogout = await api.functional.auth.registeredMember.logout(
    connection,
    { body: logoutRequest },
  );
  typia.assert(secondLogout);
  TestValidator.predicate(
    "second logout status is valid (idempotent)",
    secondLogout.status === "revoked" ||
      secondLogout.status === "already_revoked",
  );
  TestValidator.equals(
    "subsequent logout returns same session id",
    secondLogout.session_id,
    firstLogout.session_id,
  );
}
