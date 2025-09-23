import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformGuestVisitor } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformGuestVisitor";
import type { ICommunityPlatformGuestVisitorJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformGuestVisitorJoin";

/**
 * Successful guest visitor registration and correlation validation.
 *
 * This test verifies that a first-time guest visitor can join using client
 * hints and receive a valid authorization token bundle. It also validates that
 * a subsequent join with the same device_fingerprint correlates to the same
 * guest visitor and advances the recency timestamp while keeping the initial
 * timestamp stable.
 *
 * Steps:
 *
 * 1. Build a realistic ICommunityPlatformGuestVisitorJoin.ICreate payload with
 *    device_fingerprint (for correlation), user_agent, and ip.
 * 2. Call POST /auth/guestVisitor/join and assert the returned
 *    ICommunityPlatformGuestVisitor.IAuthorized payload type.
 * 3. Business checks on first join:
 *
 *    - Token bundle strings exist
 *    - Expired_at <= refreshable_until
 *    - First_seen_at === last_seen_at on initial join (when present)
 *    - Embedded summary (if present) matches top-level id and timestamps
 * 4. Wait briefly and call the endpoint again with the identical
 *    device_fingerprint to exercise correlation.
 * 5. Business checks on second join:
 *
 *    - Same visitor id as first join
 *    - Last_seen_at is not earlier than the first call
 *    - First_seen_at remains unchanged (when present on both calls)
 */
export async function test_api_guest_visitor_join_successful_registration(
  connection: api.IConnection,
) {
  // Helper to extract coherent timestamps preferring embedded summary when present
  const timesOf = (
    a: ICommunityPlatformGuestVisitor.IAuthorized,
  ): { first?: string; last?: string } => {
    const first = a.guestVisitor?.first_seen_at ?? a.first_seen_at;
    const last = a.guestVisitor?.last_seen_at ?? a.last_seen_at;
    return { first, last };
  };

  // 1) Prepare join payload within length constraints and realistic values
  const fingerprint = RandomGenerator.alphaNumeric(64); // <= 512
  const ua = RandomGenerator.paragraph({
    sentences: 1,
    wordMin: 6,
    wordMax: 12,
  }); // <= 1000
  const ip = "198.51.100.10"; // <= 255, documentation example range

  const joinBody1 = {
    device_fingerprint: fingerprint,
    user_agent: ua,
    ip,
  } satisfies ICommunityPlatformGuestVisitorJoin.ICreate;

  // 2) First join
  const firstJoin: ICommunityPlatformGuestVisitor.IAuthorized =
    await api.functional.auth.guestVisitor.join(connection, {
      body: joinBody1,
    });
  typia.assert(firstJoin);

  // 3) Business checks on first join
  // 3-a) Token bundle exists and strings are non-empty
  TestValidator.predicate(
    "access token should be non-empty",
    firstJoin.token.access.length > 0,
  );
  TestValidator.predicate(
    "refresh token should be non-empty",
    firstJoin.token.refresh.length > 0,
  );

  // 3-b) Expiry coherence: access expired_at <= refreshable_until
  const accessExp1 = new Date(firstJoin.token.expired_at).getTime();
  const refreshUntil1 = new Date(firstJoin.token.refreshable_until).getTime();
  TestValidator.predicate(
    "access expiration should be earlier than or equal to refreshable_until",
    Number.isFinite(accessExp1) &&
      Number.isFinite(refreshUntil1) &&
      accessExp1 <= refreshUntil1,
  );

  // 3-c) Summary id alignment if summary exists
  if (firstJoin.guestVisitor !== undefined) {
    TestValidator.equals(
      "embedded summary id should equal top-level id",
      firstJoin.guestVisitor.id,
      firstJoin.id,
    );
  }

  // 3-d) first_seen_at equals last_seen_at on initial join when present
  const t1 = timesOf(firstJoin);
  if (t1.first !== undefined && t1.last !== undefined) {
    TestValidator.equals(
      "on initial join, first_seen_at equals last_seen_at",
      t1.first,
      t1.last,
    );
  }
  // If both top-level and summary timestamps exist, ensure they are consistent
  if (
    firstJoin.first_seen_at !== undefined &&
    firstJoin.guestVisitor?.first_seen_at !== undefined
  ) {
    TestValidator.equals(
      "top-level and summary first_seen_at should match",
      firstJoin.first_seen_at,
      firstJoin.guestVisitor.first_seen_at,
    );
  }
  if (
    firstJoin.last_seen_at !== undefined &&
    firstJoin.guestVisitor?.last_seen_at !== undefined
  ) {
    TestValidator.equals(
      "top-level and summary last_seen_at should match",
      firstJoin.last_seen_at,
      firstJoin.guestVisitor.last_seen_at,
    );
  }

  // Small delay to allow last_seen_at update to differ
  await new Promise((resolve) => setTimeout(resolve, 10));

  // 4) Second join with the same fingerprint to verify correlation
  const joinBody2 = {
    device_fingerprint: fingerprint,
    user_agent: ua,
    ip,
  } satisfies ICommunityPlatformGuestVisitorJoin.ICreate;

  const secondJoin: ICommunityPlatformGuestVisitor.IAuthorized =
    await api.functional.auth.guestVisitor.join(connection, {
      body: joinBody2,
    });
  typia.assert(secondJoin);

  // 5-a) Same visitor id
  TestValidator.equals(
    "correlated join returns the same visitor id",
    secondJoin.id,
    firstJoin.id,
  );

  // 5-b) Timestamp progression checks when present on both
  const t2 = timesOf(secondJoin);
  if (t1.first !== undefined && t2.first !== undefined) {
    TestValidator.equals(
      "first_seen_at should remain unchanged after correlation",
      t2.first,
      t1.first,
    );
  }
  if (t1.last !== undefined && t2.last !== undefined) {
    const last1 = new Date(t1.last).getTime();
    const last2 = new Date(t2.last).getTime();
    TestValidator.predicate(
      "last_seen_at should be the same or newer after correlation",
      Number.isFinite(last1) && Number.isFinite(last2) && last2 >= last1,
    );
  }
}
