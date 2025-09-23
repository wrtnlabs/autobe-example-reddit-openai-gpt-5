import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformGuestVisitor } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformGuestVisitor";
import type { ICommunityPlatformGuestVisitorJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformGuestVisitorJoin";
import type { ICommunityPlatformGuestVisitorRefresh } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformGuestVisitorRefresh";

/**
 * Validate guest token rotation flow with a valid refresh token.
 *
 * Workflow
 *
 * 1. Guest joins via /auth/guestVisitor/join and receives initial authorization
 *    bundle
 * 2. POST /auth/guestVisitor/refresh with the received refresh token
 * 3. Verify:
 *
 *    - Response is ICommunityPlatformGuestVisitor.IAuthorized
 *    - Id remains the same
 *    - Access token is rotated (changed)
 *    - Token.expired_at advances (later than before)
 *    - Last_seen_at advances when present
 * 4. If refresh token rotated, ensure the old refresh token is no longer usable
 */
export async function test_api_guest_visitor_refresh_success_with_valid_token(
  connection: api.IConnection,
) {
  // Helper to pick the latest last_seen_at from either top-level or embedded summary
  const pickLastSeen = (
    a: ICommunityPlatformGuestVisitor.IAuthorized,
  ): (string & tags.Format<"date-time">) | undefined => {
    return a.last_seen_at ?? a.guestVisitor?.last_seen_at ?? undefined;
  };

  // 1) Join as a guest to obtain initial tokens
  const joinBody = {
    device_fingerprint: RandomGenerator.alphaNumeric(32),
    user_agent: RandomGenerator.paragraph({ sentences: 6 }),
    ip: "127.0.0.1",
  } satisfies ICommunityPlatformGuestVisitorJoin.ICreate;

  const authorized0: ICommunityPlatformGuestVisitor.IAuthorized =
    await api.functional.auth.guestVisitor.join(connection, {
      body: joinBody,
    });
  typia.assert(authorized0);

  // Preserve initial tokens and timestamps for validation
  const access0: string = authorized0.token.access;
  const refresh0: string = authorized0.token.refresh;
  const expiredAt0: Date = new Date(authorized0.token.expired_at);
  const lastSeen0: (string & tags.Format<"date-time">) | undefined =
    pickLastSeen(authorized0);

  // 2) Refresh using the valid refresh token
  const refreshBody = {
    refresh_token: refresh0,
    user_agent: RandomGenerator.paragraph({ sentences: 4 }),
    ip: "127.0.0.1",
  } satisfies ICommunityPlatformGuestVisitorRefresh.IRequest;

  const authorized1: ICommunityPlatformGuestVisitor.IAuthorized =
    await api.functional.auth.guestVisitor.refresh(connection, {
      body: refreshBody,
    });
  typia.assert(authorized1);

  // 3) Validations
  // 3-a) Same subject id
  TestValidator.equals(
    "guest id must remain stable after refresh",
    authorized1.id,
    authorized0.id,
  );

  // 3-b) Access token must change
  TestValidator.notEquals(
    "access token must be rotated",
    authorized1.token.access,
    access0,
  );

  // 3-c) expired_at should be later than before
  const expiredAt1: Date = new Date(authorized1.token.expired_at);
  TestValidator.predicate(
    "new access token expiry must be later than previous",
    expiredAt1.getTime() > expiredAt0.getTime(),
  );

  // 3-d) last_seen_at should advance if present in both responses
  const lastSeen1: (string & tags.Format<"date-time">) | undefined =
    pickLastSeen(authorized1);
  if (lastSeen0 !== undefined && lastSeen1 !== undefined) {
    const t0 = new Date(lastSeen0).getTime();
    const t1 = new Date(lastSeen1).getTime();
    TestValidator.predicate(
      "last_seen_at should advance after refresh",
      t1 >= t0,
    );
  }

  // 4) If refresh token rotated, the old refresh token should not be reusable
  const refresh1: string = authorized1.token.refresh;
  if (refresh1 !== refresh0) {
    await TestValidator.error(
      "old refresh token should be rejected after rotation",
      async () => {
        await api.functional.auth.guestVisitor.refresh(connection, {
          body: {
            refresh_token: refresh0,
            user_agent: refreshBody.user_agent ?? null,
            ip: refreshBody.ip ?? null,
          } satisfies ICommunityPlatformGuestVisitorRefresh.IRequest,
        });
      },
    );
  }
}
