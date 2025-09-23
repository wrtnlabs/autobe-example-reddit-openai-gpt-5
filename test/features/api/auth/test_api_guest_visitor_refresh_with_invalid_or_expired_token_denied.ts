import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformGuestVisitor } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformGuestVisitor";
import type { ICommunityPlatformGuestVisitorRefresh } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformGuestVisitorRefresh";

/**
 * Deny guest token refresh with invalid/expired refresh tokens.
 *
 * Business goal:
 *
 * - Guests can rotate tokens via POST /auth/guestVisitor/refresh. When the
 *   provided refresh token is invalid, expired, or revoked, the server must
 *   reject the request.
 *
 * Implementation notes:
 *
 * - We submit two type-correct but invalid inputs to trigger rejection in a real
 *   backend.
 * - In simulation mode, the SDK returns random authorized data, so the test
 *   accepts that success and validates response shape with typia.assert.
 * - Never touch connection.headers; token management is SDK-internal.
 * - Never assert specific HTTP status codes; just validate error occurrence.
 *
 * Steps:
 *
 * 1. Build an obviously invalid refresh token payload.
 * 2. Attempt refresh and expect an error (real backend) or success (simulate).
 * 3. Repeat with a JWT-shaped but invalid token string.
 */
export async function test_api_guest_visitor_refresh_with_invalid_or_expired_token_denied(
  connection: api.IConnection,
) {
  // 1) Invalid refresh token attempt
  const invalidBody = {
    refresh_token: `invalid-${RandomGenerator.alphaNumeric(24)}`,
    user_agent: "e2e-test/guest-refresh-invalid",
    ip: "203.0.113.1",
  } satisfies ICommunityPlatformGuestVisitorRefresh.IRequest;

  if (connection.simulate === true) {
    // Simulation mode returns random authorized payload; assert structure only
    const simulated1: ICommunityPlatformGuestVisitor.IAuthorized =
      await api.functional.auth.guestVisitor.refresh(connection, {
        body: invalidBody,
      });
    typia.assert(simulated1);
  } else {
    // Real backend: expect rejection for invalid token
    await TestValidator.error(
      "refresh must be denied for an obviously invalid token",
      async () => {
        await api.functional.auth.guestVisitor.refresh(connection, {
          body: invalidBody,
        });
      },
    );
  }

  // 2) Expired-looking/JWT-shaped but invalid token attempt
  const expiredLookingBody = {
    // JWT-shaped but bogus token parts to mimic an expired/invalid token
    refresh_token: `eyJ${RandomGenerator.alphaNumeric(6)}.${RandomGenerator.alphaNumeric(16)}.${RandomGenerator.alphaNumeric(32)}`,
    user_agent: "e2e-test/guest-refresh-expired-like",
    ip: "198.51.100.13",
  } satisfies ICommunityPlatformGuestVisitorRefresh.IRequest;

  if (connection.simulate === true) {
    const simulated2: ICommunityPlatformGuestVisitor.IAuthorized =
      await api.functional.auth.guestVisitor.refresh(connection, {
        body: expiredLookingBody,
      });
    typia.assert(simulated2);
  } else {
    await TestValidator.error(
      "refresh must be denied for expired/invalid-looking JWT",
      async () => {
        await api.functional.auth.guestVisitor.refresh(connection, {
          body: expiredLookingBody,
        });
      },
    );
  }
}
