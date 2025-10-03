import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IClientContext } from "@ORGANIZATION/PROJECT-api/lib/structures/IClientContext";
import type { ICommunityPlatformRegisteredMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRegisteredMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

export async function test_api_auth_session_refresh_guest_guard_resume_after_join(
  connection: api.IConnection,
) {
  /**
   * Validate guest guard on session refresh and resume-after-join behavior.
   *
   * Steps
   *
   * 1. Attempt to refresh without authentication using a fresh unauthenticated
   *    connection. Expect an error (skip in simulator mode where refresh
   *    returns random success).
   * 2. Join as a new registered member on that unauthenticated connection.
   * 3. Refresh again with the now-authenticated session and validate success.
   * 4. Ensure identity continuity between join and refresh responses.
   */

  // Create a fresh unauthenticated connection (do not touch headers thereafter)
  const guest: api.IConnection = { ...connection, headers: {} };

  // 1) Guest guard: unauthenticated refresh should fail (skip in simulation)
  if (guest.simulate !== true) {
    await TestValidator.error(
      "unauthenticated refresh must be rejected",
      async () => {
        await api.functional.auth.registeredMember.refresh(guest, {
          body: {} satisfies ICommunityPlatformRegisteredMember.IRefresh,
        });
      },
    );
  }

  // 2) Join as a fresh member (SDK auto-attaches token to 'guest' connection)
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    username: RandomGenerator.name(1),
    password: RandomGenerator.alphaNumeric(12),
    displayName: RandomGenerator.name(),
    client: {
      userAgent: `e2e/${RandomGenerator.alphaNumeric(8)}`,
      ip: "127.0.0.1",
      clientPlatform: "e2e-test",
      clientDevice: "node",
      sessionType: "standard",
    },
  } satisfies ICommunityPlatformRegisteredMember.IJoin;
  const joined: ICommunityPlatformRegisteredMember.IAuthorized =
    await api.functional.auth.registeredMember.join(guest, { body: joinBody });
  typia.assert(joined);

  // 3) Refresh with authenticated session
  const refreshed: ICommunityPlatformRegisteredMember.IAuthorized =
    await api.functional.auth.registeredMember.refresh(guest, {
      body: {} satisfies ICommunityPlatformRegisteredMember.IRefresh,
    });
  typia.assert(refreshed);

  // 4) Validate identity continuity
  TestValidator.equals(
    "refreshed identity must equal joined identity",
    refreshed.id,
    joined.id,
  );
}
