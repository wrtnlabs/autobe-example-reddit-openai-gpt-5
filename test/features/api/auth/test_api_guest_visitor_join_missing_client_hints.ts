import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformGuestVisitor } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformGuestVisitor";
import type { ICommunityPlatformGuestVisitorJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformGuestVisitorJoin";

/**
 * Guest visitor join tolerates missing client hints and correlates by
 * fingerprint.
 *
 * Purpose
 *
 * - Ensure POST /auth/guestVisitor/join accepts empty or minimal payloads and
 *   still issues a valid authorization bundle for a guest visitor.
 * - Verify correlation behavior when a stable device_fingerprint is supplied by
 *   asserting the same visitor id is returned and last_seen_at is updated.
 *
 * Steps
 *
 * 1. Call join with an empty body {} and validate:
 *
 *    - Response type matches ICommunityPlatformGuestVisitor.IAuthorized
 *    - Token fields are non-empty strings
 *    - Last_seen_at is set (non-undefined)
 *    - If guestVisitor summary exists, its id equals top-level id
 * 2. Call join with explicit null hints { user_agent: null, ip: null } and
 *    validate same points.
 * 3. Choose a device_fingerprint and call join twice with it, asserting:
 *
 *    - Both responses are valid
 *    - The ids are equal (correlation)
 *    - The latter last_seen_at is greater than or equal to the former
 */
export async function test_api_guest_visitor_join_missing_client_hints(
  connection: api.IConnection,
) {
  // 1) Empty body should be accepted
  const emptyBody = {
    // all fields are optional; send nothing
  } satisfies ICommunityPlatformGuestVisitorJoin.ICreate;
  const first = await api.functional.auth.guestVisitor.join(connection, {
    body: emptyBody,
  });
  typia.assert<ICommunityPlatformGuestVisitor.IAuthorized>(first);

  TestValidator.predicate(
    "first: last_seen_at should be defined",
    first.last_seen_at !== undefined,
  );
  TestValidator.predicate(
    "first: access token should be non-empty",
    first.token.access.length > 0,
  );
  TestValidator.predicate(
    "first: refresh token should be non-empty",
    first.token.refresh.length > 0,
  );
  if (first.guestVisitor !== undefined) {
    TestValidator.equals(
      "first: summary id equals top-level id",
      first.guestVisitor.id,
      first.id,
    );
  }

  // 2) Explicit null hints should also be accepted
  const nullHintsBody = {
    user_agent: null,
    ip: null,
  } satisfies ICommunityPlatformGuestVisitorJoin.ICreate;
  const second = await api.functional.auth.guestVisitor.join(connection, {
    body: nullHintsBody,
  });
  typia.assert<ICommunityPlatformGuestVisitor.IAuthorized>(second);

  TestValidator.predicate(
    "second: last_seen_at should be defined",
    second.last_seen_at !== undefined,
  );
  TestValidator.predicate(
    "second: access token should be non-empty",
    second.token.access.length > 0,
  );
  TestValidator.predicate(
    "second: refresh token should be non-empty",
    second.token.refresh.length > 0,
  );
  if (second.guestVisitor !== undefined) {
    TestValidator.equals(
      "second: summary id equals top-level id",
      second.guestVisitor.id,
      second.id,
    );
  }

  // 3) Correlation by device_fingerprint across consecutive joins
  const device_fingerprint: string = RandomGenerator.alphaNumeric(64);
  const fpBody = {
    device_fingerprint,
  } satisfies ICommunityPlatformGuestVisitorJoin.ICreate;

  const correlated1 = await api.functional.auth.guestVisitor.join(connection, {
    body: fpBody,
  });
  typia.assert<ICommunityPlatformGuestVisitor.IAuthorized>(correlated1);
  TestValidator.predicate(
    "correlated1: last_seen_at should be defined",
    correlated1.last_seen_at !== undefined,
  );

  const correlated2 = await api.functional.auth.guestVisitor.join(connection, {
    body: fpBody,
  });
  typia.assert<ICommunityPlatformGuestVisitor.IAuthorized>(correlated2);
  TestValidator.predicate(
    "correlated2: last_seen_at should be defined",
    correlated2.last_seen_at !== undefined,
  );

  // Same id is expected when fingerprint correlates
  TestValidator.equals(
    "correlation: ids should match for same device_fingerprint",
    correlated2.id,
    correlated1.id,
  );

  // last_seen_at should be monotonic (second >= first)
  const t1 = new Date(correlated1.last_seen_at!);
  const t2 = new Date(correlated2.last_seen_at!);
  TestValidator.predicate(
    "correlation: last_seen_at should be updated or equal on subsequent join",
    t2.getTime() >= t1.getTime(),
  );

  if (correlated1.guestVisitor !== undefined) {
    TestValidator.equals(
      "correlated1: summary id equals top-level id",
      correlated1.guestVisitor.id,
      correlated1.id,
    );
  }
  if (correlated2.guestVisitor !== undefined) {
    TestValidator.equals(
      "correlated2: summary id equals top-level id",
      correlated2.guestVisitor.id,
      correlated2.id,
    );
  }
}
