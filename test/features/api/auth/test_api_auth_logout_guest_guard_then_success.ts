import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IClientContext } from "@ORGANIZATION/PROJECT-api/lib/structures/IClientContext";
import type { ICommunityPlatformRegisteredMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRegisteredMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

export async function test_api_auth_logout_guest_guard_then_success(
  connection: api.IConnection,
) {
  /**
   * Validate guest guard on logout and successful logout after authentication.
   *
   * Steps
   *
   * 1. Attempt to logout without authentication (guest) → expect error.
   * 2. Join (register) a new member to obtain an authenticated session.
   * 3. Perform logout with the authenticated session → expect success and status
   *    to be one of "revoked" | "already_revoked".
   * 4. Optional: call logout again to verify idempotency.
   */

  // 1) Guest guard: logout without authentication must fail
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  const unauthLogoutBody = {
    userAgent: `e2e/${RandomGenerator.alphaNumeric(8)}`,
    clientPlatform: "node-e2e",
    clientDevice: "ci-runner",
  } satisfies ICommunityPlatformRegisteredMember.ILogoutRequest;
  await TestValidator.error(
    "guest guard: logout without authentication should fail",
    async () => {
      await api.functional.auth.registeredMember.logout(unauthConn, {
        body: unauthLogoutBody,
      });
    },
  );

  // 2) Join to authenticate and acquire an active session
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    username: RandomGenerator.alphaNumeric(12),
    password: RandomGenerator.alphaNumeric(12),
    displayName: RandomGenerator.name(),
    client: {
      userAgent: `e2e/${RandomGenerator.alphaNumeric(8)}`,
      clientPlatform: "node-e2e",
      clientDevice: "ci-runner",
      sessionType: "standard",
      ip: "127.0.0.1",
    },
  } satisfies ICommunityPlatformRegisteredMember.IJoin;
  const authorized = await api.functional.auth.registeredMember.join(
    connection,
    {
      body: joinBody,
    },
  );
  typia.assert(authorized);

  // 3) Logout with authenticated session
  const logoutBody = {
    userAgent: `e2e/${RandomGenerator.alphaNumeric(8)}`,
    clientPlatform: "node-e2e",
    clientDevice: "ci-runner",
  } satisfies ICommunityPlatformRegisteredMember.ILogoutRequest;
  const result = await api.functional.auth.registeredMember.logout(connection, {
    body: logoutBody,
  });
  typia.assert(result);

  // status should be either "revoked" or "already_revoked"
  TestValidator.predicate(
    "logout returns status 'revoked' or 'already_revoked'",
    result.status === "revoked" || result.status === "already_revoked",
  );

  // 4) Optional idempotency check: calling logout again should still succeed
  const result2 = await api.functional.auth.registeredMember.logout(
    connection,
    {
      body: logoutBody,
    },
  );
  typia.assert(result2);
  TestValidator.predicate(
    "second logout is idempotent and returns revoked or already_revoked",
    result2.status === "revoked" || result2.status === "already_revoked",
  );
}
