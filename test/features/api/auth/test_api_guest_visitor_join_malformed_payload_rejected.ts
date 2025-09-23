import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformGuestVisitor } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformGuestVisitor";
import type { ICommunityPlatformGuestVisitorJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformGuestVisitorJoin";

export async function test_api_guest_visitor_join_malformed_payload_rejected(
  connection: api.IConnection,
) {
  // 1) Rejection on oversize strings (business validation using correct types)
  const tooLongFingerprint = RandomGenerator.alphabets(513);
  await TestValidator.error(
    "reject oversize device_fingerprint (>512)",
    async () => {
      await api.functional.auth.guestVisitor.join(connection, {
        body: {
          device_fingerprint: tooLongFingerprint,
        } satisfies ICommunityPlatformGuestVisitorJoin.ICreate,
      });
    },
  );

  const tooLongUA = RandomGenerator.alphabets(1001);
  await TestValidator.error("reject oversize user_agent (>1000)", async () => {
    await api.functional.auth.guestVisitor.join(connection, {
      body: {
        device_fingerprint: RandomGenerator.alphabets(32),
        user_agent: tooLongUA,
      } satisfies ICommunityPlatformGuestVisitorJoin.ICreate,
    });
  });

  const tooLongIP = RandomGenerator.alphabets(256);
  await TestValidator.error("reject oversize ip (>255)", async () => {
    await api.functional.auth.guestVisitor.join(connection, {
      body: {
        device_fingerprint: RandomGenerator.alphabets(32),
        ip: tooLongIP,
      } satisfies ICommunityPlatformGuestVisitorJoin.ICreate,
    });
  });

  // 2) Valid boundary payload succeeds (explicit nulls where allowed)
  const validFingerprint512 = RandomGenerator.alphabets(512);
  const joinBody1 = {
    device_fingerprint: validFingerprint512,
    user_agent: null,
    ip: null,
  } satisfies ICommunityPlatformGuestVisitorJoin.ICreate;

  const auth1: ICommunityPlatformGuestVisitor.IAuthorized =
    await api.functional.auth.guestVisitor.join(connection, {
      body: joinBody1,
    });
  typia.assert(auth1);
  if (auth1.guestVisitor !== undefined) {
    typia.assertGuard(auth1.guestVisitor!);
    TestValidator.equals(
      "guestVisitor summary id equals top-level id (first join)",
      auth1.guestVisitor.id,
      auth1.id,
    );
  }

  // 3) Idempotency/correlation: same fingerprint yields same id
  const auth2: ICommunityPlatformGuestVisitor.IAuthorized =
    await api.functional.auth.guestVisitor.join(connection, {
      body: {
        device_fingerprint: validFingerprint512,
      } satisfies ICommunityPlatformGuestVisitorJoin.ICreate,
    });
  typia.assert(auth2);
  TestValidator.equals(
    "second join with same device_fingerprint returns same id",
    auth2.id,
    auth1.id,
  );

  // 4) Different fingerprint should correlate to different id
  const differentFingerprint = RandomGenerator.alphabets(64);
  const auth3: ICommunityPlatformGuestVisitor.IAuthorized =
    await api.functional.auth.guestVisitor.join(connection, {
      body: {
        device_fingerprint: differentFingerprint,
        user_agent: RandomGenerator.name(3),
        ip: null,
      } satisfies ICommunityPlatformGuestVisitorJoin.ICreate,
    });
  typia.assert(auth3);
  TestValidator.notEquals(
    "different fingerprint results in different guest id",
    auth3.id,
    auth1.id,
  );

  // 5) Additional boundary success (exact max lengths for user_agent and ip)
  const userAgent1000 = RandomGenerator.alphabets(1000);
  const ip255 = RandomGenerator.alphabets(255);
  const auth4: ICommunityPlatformGuestVisitor.IAuthorized =
    await api.functional.auth.guestVisitor.join(connection, {
      body: {
        device_fingerprint: RandomGenerator.alphabets(32),
        user_agent: userAgent1000,
        ip: ip255,
      } satisfies ICommunityPlatformGuestVisitorJoin.ICreate,
    });
  typia.assert(auth4);
}
