import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IClientContext } from "@ORGANIZATION/PROJECT-api/lib/structures/IClientContext";
import type { ICommunityPlatformGuestVisitor } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformGuestVisitor";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

export async function test_api_guest_visitor_registration_session_issuance(
  connection: api.IConnection,
) {
  /**
   * Register an unauthenticated visitor as a guest and receive an authorized
   * session.
   *
   * Steps
   *
   * 1. Call POST /auth/guestVisitor/join with minimal payload (optionally
   *    including client context)
   * 2. Assert response conforms to ICommunityPlatformGuestVisitor.IAuthorized
   * 3. Validate token presence and temporal logic (expired_at in future,
   *    refreshable_until >= expired_at)
   * 4. If user summary is present, ensure IDs align with authorized id and
   *    timestamps are monotonic
   * 5. Do not touch connection.headers; SDK handles header management internally
   */
  // 1) Minimal join payload with lightweight client metadata
  const joinBody = {
    // All identity fields are optional for guest; provide only client hints
    client: {
      userAgent: `e2e/${RandomGenerator.alphaNumeric(8)}`,
      clientPlatform: `web-${RandomGenerator.alphabets(5)}`,
      clientDevice: `device-${RandomGenerator.alphabets(6)}`,
      sessionType: "standard",
    },
  } satisfies ICommunityPlatformGuestVisitor.IJoin;

  // 2) Execute join
  const authorized = await api.functional.auth.guestVisitor.join(connection, {
    body: joinBody,
  });

  // 3) Validate response shape precisely
  typia.assert(authorized);

  // 4) Business validations on token contents and temporal fields
  const token = authorized.token; // IAuthorizationToken
  TestValidator.predicate(
    "access token string should be non-empty",
    token.access.length > 0,
  );
  TestValidator.predicate(
    "refresh token string should be non-empty",
    token.refresh.length > 0,
  );

  const now = Date.now();
  const accessExpiry = new Date(token.expired_at).getTime();
  const refreshLimit = new Date(token.refreshable_until).getTime();

  TestValidator.predicate(
    "access token expiry must be in the future",
    accessExpiry > now,
  );
  TestValidator.predicate(
    "refreshable_until must not be earlier than expired_at",
    refreshLimit >= accessExpiry,
  );

  // 5) Optional user summary consistency checks
  if (authorized.user !== undefined) {
    const u = authorized.user; // ICommunityPlatformUser.ISummary
    TestValidator.equals(
      "user summary id must match authorized id",
      u.id,
      authorized.id,
    );

    const createdAt = new Date(u.created_at).getTime();
    const updatedAt = new Date(u.updated_at).getTime();
    TestValidator.predicate(
      "user.updated_at must be >= user.created_at",
      updatedAt >= createdAt,
    );
  }
}
