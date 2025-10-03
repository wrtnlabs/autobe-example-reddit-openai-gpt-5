import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IClientContext } from "@ORGANIZATION/PROJECT-api/lib/structures/IClientContext";
import type { ICommunityPlatformGuestVisitor } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformGuestVisitor";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

/**
 * Reject guest session refresh when token context is invalid or missing.
 *
 * This test verifies the negative-path behavior of the guestVisitor refresh
 * endpoint. It ensures that:
 *
 * 1. Providing a syntactically valid but unknown (tampered) token results in an
 *    error without creating/rotating any session.
 * 2. Omitting token context entirely (and not having any auth header) also results
 *    in an error.
 * 3. Repeating the invalid attempt still fails, implying no session artifact was
 *    created as a side effect of the first failure.
 *
 * Implementation notes:
 *
 * - Uses a fresh unauthenticated connection object (headers: {}) and never
 *   touches headers thereafter, satisfying strict header management rules.
 * - Avoids asserting HTTP codes/messages; only checks that an error occurs.
 * - In SDK simulation mode, negative-path is not feasible (simulator returns
 *   randomized success). In that case, call once and type-assert then exit.
 */
export async function test_api_guest_visitor_session_refresh_invalid_token(
  connection: api.IConnection,
) {
  // If SDK runs in simulation mode, simulator returns random success values.
  // Negative-path tests cannot be validated there, so just assert response type and exit.
  if (connection.simulate === true) {
    const simulated = await api.functional.auth.guestVisitor.refresh(
      { ...connection, headers: {} },
      {
        body: {
          token: `inv_${RandomGenerator.alphaNumeric(64)}`,
          rotate: true,
          client: {
            userAgent: `e2e/${RandomGenerator.alphabets(6)}`,
            ip: "203.0.113.1",
            clientPlatform: "web-chrome",
            clientDevice: "desktop",
            sessionType: "standard",
          },
        } satisfies ICommunityPlatformGuestVisitor.IRefresh,
      },
    );
    typia.assert(simulated);
    return;
  }

  // Create a fresh unauthenticated connection; do not inspect or mutate headers after this point.
  const unauthConn: api.IConnection = { ...connection, headers: {} };

  // Prepare a clearly invalid/non-existent token and client context.
  const invalidToken: string = `inv_${RandomGenerator.alphaNumeric(64)}`;
  const bodyInvalid = {
    token: invalidToken,
    rotate: true,
    client: {
      userAgent: `e2e/${RandomGenerator.alphabets(6)}`,
      ip: "198.51.100.7",
      clientPlatform: "web-chrome",
      clientDevice: "desktop",
      sessionType: "standard",
    },
  } satisfies ICommunityPlatformGuestVisitor.IRefresh;

  // 1) Invalid token should be rejected.
  await TestValidator.error(
    "guest refresh with invalid token should be rejected",
    async () => {
      await api.functional.auth.guestVisitor.refresh(unauthConn, {
        body: bodyInvalid,
      });
    },
  );

  // 2) Missing token context (no header, no body token) should also be rejected.
  const bodyNoToken = {
    client: {
      userAgent: `e2e/${RandomGenerator.alphabets(6)}`,
      ip: "203.0.113.9",
      clientPlatform: "web-firefox",
      clientDevice: "laptop",
      sessionType: "standard",
    },
  } satisfies ICommunityPlatformGuestVisitor.IRefresh;
  await TestValidator.error(
    "guest refresh without token context should be rejected",
    async () => {
      await api.functional.auth.guestVisitor.refresh(unauthConn, {
        body: bodyNoToken,
      });
    },
  );

  // 3) Repeating the invalid token attempt still fails (no session rotation/creation occurred).
  await TestValidator.error(
    "repeated invalid refresh attempt still fails (no artifact created)",
    async () => {
      await api.functional.auth.guestVisitor.refresh(unauthConn, {
        body: bodyInvalid,
      });
    },
  );
}
