import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IClientContext } from "@ORGANIZATION/PROJECT-api/lib/structures/IClientContext";
import type { ICommunityPlatformRegisteredMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRegisteredMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

/**
 * Validate member session refresh success and failure after revocation.
 *
 * Business flow
 *
 * 1. Register a new member (join) to obtain initial authorization (access/refresh
 *    token pair).
 * 2. Perform a session refresh using the current authenticated context.
 *
 *    - Validate that the refreshed authorization belongs to the same user.
 * 3. Logout (revoke) the current session.
 * 4. Attempt to refresh again; expect an error because the session is revoked.
 *
 * Notes
 *
 * - SDK automatically manages Authorization headers upon join/refresh.
 * - Refresh body fields are optional; an empty object is valid.
 * - Negative-path validation uses TestValidator.error without inspecting status
 *   codes.
 */
export async function test_api_auth_session_refresh_extend_and_handle_revoked(
  connection: api.IConnection,
) {
  // 1) Join: establish a fresh registered member session
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    username: RandomGenerator.alphabets(12),
    password: RandomGenerator.alphaNumeric(16),
    displayName: RandomGenerator.name(),
    client: {
      userAgent: "e2e/refresh-flow",
      clientPlatform: "node-e2e",
      clientDevice: "ci-runner",
    } satisfies IClientContext,
  } satisfies ICommunityPlatformRegisteredMember.IJoin;

  const joined = await api.functional.auth.registeredMember.join(connection, {
    body: joinBody,
  });
  typia.assert<ICommunityPlatformRegisteredMember.IAuthorized>(joined);

  // 2) Positive refresh: renew session with current Authorization context
  const refreshed = await api.functional.auth.registeredMember.refresh(
    connection,
    {
      body: {} satisfies ICommunityPlatformRegisteredMember.IRefresh,
    },
  );
  typia.assert<ICommunityPlatformRegisteredMember.IAuthorized>(refreshed);

  // Business check: refreshed principal must equal the originally joined user
  TestValidator.equals(
    "refreshed user id should match the joined user id",
    refreshed.id,
    joined.id,
  );

  // 3) Logout: revoke current session (idempotent behavior acceptable)
  const logoutResult = await api.functional.auth.registeredMember.logout(
    connection,
    {
      body: {
        userAgent: "e2e/refresh-flow",
        clientPlatform: "node-e2e",
        clientDevice: "ci-runner",
      } satisfies ICommunityPlatformRegisteredMember.ILogoutRequest,
    },
  );
  typia.assert<ICommunityPlatformRegisteredMember.ILogoutResult>(logoutResult);

  // 4) Negative refresh: after revocation, refresh must fail
  await TestValidator.error(
    "refresh after logout must be rejected",
    async () => {
      await api.functional.auth.registeredMember.refresh(connection, {
        body: {} satisfies ICommunityPlatformRegisteredMember.IRefresh,
      });
    },
  );
}
