import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IClientContext } from "@ORGANIZATION/PROJECT-api/lib/structures/IClientContext";
import type { ICommunityPlatformGuestVisitor } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformGuestVisitor";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

/**
 * Refresh a guest visitor session to extend/rotate its authorization.
 *
 * This test verifies the guest-visitor long-lived session flow:
 *
 * 1. Create a guest session via POST /auth/guestVisitor/join and capture identity
 *    and token timestamps.
 * 2. Call POST /auth/guestVisitor/refresh using implicit token context
 *    (Authorization header set by SDK) with an empty body.
 *
 *    - Assert the same user id is returned.
 *    - Assert that either token expiry is extended (expired_at increases) or access
 *         token rotates (access changes).
 *    - Assert refreshable_until does not decrease.
 * 3. Call refresh again with rotate: true and client hints to exercise rotation
 *    path; assert identity consistency and monotonic non-decreasing
 *    timestamps.
 * 4. Optionally refresh once more to confirm idempotent/monotonic behavior.
 * 5. For each token snapshot, assert temporal consistency (refreshable_until >=
 *    expired_at).
 */
export async function test_api_guest_visitor_session_refresh_extension(
  connection: api.IConnection,
) {
  // 1) Establish initial guest session
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    username: RandomGenerator.alphaNumeric(12),
    password: RandomGenerator.alphaNumeric(16),
    displayName: RandomGenerator.name(),
    client: {
      userAgent: `e2e-join/${RandomGenerator.alphaNumeric(6)}`,
      ip: "127.0.0.1",
      clientPlatform: "node-e2e",
      clientDevice: "ci-runner",
      sessionType: "standard",
    },
  } satisfies ICommunityPlatformGuestVisitor.IJoin;

  const firstAuth: ICommunityPlatformGuestVisitor.IAuthorized =
    await api.functional.auth.guestVisitor.join(connection, { body: joinBody });
  typia.assert(firstAuth);

  // Capture baseline identifiers and timestamps
  const firstUserId: string & tags.Format<"uuid"> = firstAuth.id;
  const firstAccessToken: string = firstAuth.token.access;
  const firstExpiredAtMs: number = new Date(
    firstAuth.token.expired_at,
  ).getTime();
  const firstRefreshableUntilMs: number = new Date(
    firstAuth.token.refreshable_until,
  ).getTime();

  // Helper: sanity check of temporal consistency per token
  const assertTokenTemporalConsistency = (
    titlePrefix: string,
    token: IAuthorizationToken,
  ): void => {
    const exp = new Date(token.expired_at).getTime();
    const rfu = new Date(token.refreshable_until).getTime();
    TestValidator.predicate(
      `${titlePrefix} - refreshable_until is not earlier than expired_at`,
      rfu >= exp,
    );
  };

  assertTokenTemporalConsistency("after join", firstAuth.token);

  // 2) First refresh using implicit token context (empty body)
  const refreshBody1 = {} satisfies ICommunityPlatformGuestVisitor.IRefresh;
  const refreshed1: ICommunityPlatformGuestVisitor.IAuthorized =
    await api.functional.auth.guestVisitor.refresh(connection, {
      body: refreshBody1,
    });
  typia.assert(refreshed1);

  TestValidator.equals(
    "identity remains consistent after first refresh",
    refreshed1.id,
    firstUserId,
  );
  const refreshed1ExpiredAtMs: number = new Date(
    refreshed1.token.expired_at,
  ).getTime();
  const refreshed1RefreshableUntilMs: number = new Date(
    refreshed1.token.refreshable_until,
  ).getTime();

  // Either expiry extends OR access token is rotated
  TestValidator.predicate(
    "first refresh extends expiry or rotates access token",
    refreshed1ExpiredAtMs > firstExpiredAtMs ||
      refreshed1.token.access !== firstAccessToken,
  );
  TestValidator.predicate(
    "first refresh keeps refreshable_until non-decreasing",
    refreshed1RefreshableUntilMs >= firstRefreshableUntilMs,
  );
  assertTokenTemporalConsistency("after first refresh", refreshed1.token);

  // 3) Second refresh with rotate=true and client hints
  const refreshBody2 = {
    rotate: true,
    client: {
      userAgent: `e2e-rotate/${RandomGenerator.alphaNumeric(6)}`,
      ip: "127.0.0.1",
      clientPlatform: "node-e2e",
      clientDevice: "ci-runner",
      sessionType: "standard",
    },
  } satisfies ICommunityPlatformGuestVisitor.IRefresh;
  const refreshed2: ICommunityPlatformGuestVisitor.IAuthorized =
    await api.functional.auth.guestVisitor.refresh(connection, {
      body: refreshBody2,
    });
  typia.assert(refreshed2);

  TestValidator.equals(
    "identity remains consistent after second refresh",
    refreshed2.id,
    firstUserId,
  );
  const refreshed2ExpiredAtMs: number = new Date(
    refreshed2.token.expired_at,
  ).getTime();
  const refreshed2RefreshableUntilMs: number = new Date(
    refreshed2.token.refreshable_until,
  ).getTime();
  TestValidator.predicate(
    "second refresh keeps expiry non-decreasing",
    refreshed2ExpiredAtMs >= refreshed1ExpiredAtMs,
  );
  TestValidator.predicate(
    "second refresh keeps refreshable_until non-decreasing",
    refreshed2RefreshableUntilMs >= refreshed1RefreshableUntilMs,
  );
  assertTokenTemporalConsistency("after second refresh", refreshed2.token);

  // 4) Optional third refresh to validate idempotent/monotonic behavior
  const refreshed3: ICommunityPlatformGuestVisitor.IAuthorized =
    await api.functional.auth.guestVisitor.refresh(connection, {
      body: { rotate: true } satisfies ICommunityPlatformGuestVisitor.IRefresh,
    });
  typia.assert(refreshed3);
  TestValidator.equals(
    "identity remains consistent after third refresh",
    refreshed3.id,
    firstUserId,
  );
  const refreshed3ExpiredAtMs: number = new Date(
    refreshed3.token.expired_at,
  ).getTime();
  TestValidator.predicate(
    "third refresh keeps expiry non-decreasing",
    refreshed3ExpiredAtMs >= refreshed2ExpiredAtMs,
  );
  assertTokenTemporalConsistency("after third refresh", refreshed3.token);
}
