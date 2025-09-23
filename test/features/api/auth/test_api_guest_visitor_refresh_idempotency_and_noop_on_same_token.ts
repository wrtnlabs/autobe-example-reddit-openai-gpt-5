import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformGuestVisitor } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformGuestVisitor";
import type { ICommunityPlatformGuestVisitorJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformGuestVisitorJoin";
import type { ICommunityPlatformGuestVisitorRefresh } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformGuestVisitorRefresh";

/**
 * Validate guest refresh determinism and rotation policy.
 *
 * Steps:
 *
 * 1. Join as an anonymous visitor to obtain token bundle (access/refresh).
 * 2. Call refresh once; verify same visitor id and non-decreasing last_seen_at.
 * 3. If refresh token rotated, ensure the old token is rejected.
 * 4. If not rotated, call refresh again with the same token and re-validate id
 *    consistency and monotonic last_seen_at. Also validate embedded summary if
 *    present.
 */
export async function test_api_guest_visitor_refresh_idempotency_and_noop_on_same_token(
  connection: api.IConnection,
) {
  // Test context inputs
  const deviceFingerprint = RandomGenerator.alphaNumeric(48);
  const userAgent = RandomGenerator.paragraph({ sentences: 6 });
  const ip = "203.0.113.10"; // TEST-NET-3 example address

  // 1) Guest join to obtain initial tokens
  const joinBody = {
    device_fingerprint: deviceFingerprint,
    user_agent: userAgent,
    ip,
  } satisfies ICommunityPlatformGuestVisitorJoin.ICreate;
  const joined = await api.functional.auth.guestVisitor.join(connection, {
    body: joinBody,
  });
  typia.assert(joined);

  const id0 = joined.id;
  const r0 = joined.token.refresh;
  const t0 = joined.last_seen_at ? Date.parse(joined.last_seen_at) : null;

  // 2) First refresh with r0
  const refreshBody1 = {
    refresh_token: r0,
    user_agent: userAgent,
    ip,
  } satisfies ICommunityPlatformGuestVisitorRefresh.IRequest;
  const r1 = await api.functional.auth.guestVisitor.refresh(connection, {
    body: refreshBody1,
  });
  typia.assert(r1);

  // Same visitor id must be preserved
  TestValidator.equals(
    "visitor id must remain the same after first refresh",
    r1.id,
    id0,
  );

  // If embedded summary exists, validate its id matches the top-level id
  if (r1.guestVisitor) {
    typia.assert(r1.guestVisitor);
    TestValidator.equals(
      "embedded summary id matches authorized id after first refresh",
      r1.guestVisitor.id,
      r1.id,
    );
  }

  // last_seen_at should be monotonically non-decreasing when present
  const t1 = r1.last_seen_at ? Date.parse(r1.last_seen_at) : null;
  if (t0 !== null && t1 !== null) {
    TestValidator.predicate(
      "last_seen_at should not go backwards after first refresh",
      t0 <= t1,
    );
  }

  // 3) Branch based on rotation policy
  const rotated = r1.token.refresh !== r0;
  if (rotated) {
    // Old refresh token must be rejected now
    await TestValidator.error(
      "old refresh token should be invalid after rotation",
      async () => {
        await api.functional.auth.guestVisitor.refresh(connection, {
          body: {
            refresh_token: r0,
            user_agent: userAgent,
            ip,
          } satisfies ICommunityPlatformGuestVisitorRefresh.IRequest,
        });
      },
    );
  } else {
    // 4) If not rotated, calling refresh again with the same token should succeed
    const refreshBody2 = {
      refresh_token: r0,
      user_agent: userAgent,
      ip,
    } satisfies ICommunityPlatformGuestVisitorRefresh.IRequest;
    const r2 = await api.functional.auth.guestVisitor.refresh(connection, {
      body: refreshBody2,
    });
    typia.assert(r2);

    // Identity must remain stable
    TestValidator.equals(
      "visitor id must remain the same after second refresh without rotation",
      r2.id,
      id0,
    );

    // If embedded summary exists, validate its id matches the top-level id
    if (r2.guestVisitor) {
      typia.assert(r2.guestVisitor);
      TestValidator.equals(
        "embedded summary id matches authorized id after second refresh",
        r2.guestVisitor.id,
        r2.id,
      );
    }

    // last_seen_at should be non-decreasing compared to r1
    const t2 = r2.last_seen_at ? Date.parse(r2.last_seen_at) : null;
    if (t1 !== null && t2 !== null) {
      TestValidator.predicate(
        "last_seen_at should not go backwards after second refresh",
        t1 <= t2,
      );
    }
  }
}
