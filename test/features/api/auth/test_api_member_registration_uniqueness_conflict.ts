import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IClientContext } from "@ORGANIZATION/PROJECT-api/lib/structures/IClientContext";
import type { ICommunityPlatformRegisteredMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRegisteredMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

/**
 * Member registration uniqueness conflict on email and username
 * (case-insensitive).
 *
 * Purpose
 *
 * - Ensure that joining a registered member account enforces case-insensitive
 *   uniqueness for both email and username.
 *
 * What this validates
 *
 * 1. First registration with base email/username succeeds and returns an
 *    authorization payload (typia.assert validates entire response structure).
 * 2. Second registration attempt using the SAME email but different casing fails.
 * 3. Third registration attempt using the SAME username but different casing
 *    fails.
 *
 * Important constraints and practices
 *
 * - Do NOT verify HTTP status codes (only error existence via
 *   TestValidator.error).
 * - Do NOT manipulate connection.headers; for unauthenticated trials, create a
 *   fresh connection object with empty headers and stop there.
 * - Use "satisfies IJoin" for request bodies; no type assertions or any.
 */
export async function test_api_member_registration_uniqueness_conflict(
  connection: api.IConnection,
) {
  // 0) Deterministic base identifiers
  const localPart = RandomGenerator.alphabets(10);
  const email = `${localPart}@example.com`;
  const username = RandomGenerator.alphabets(12);
  const password = RandomGenerator.alphaNumeric(14);

  // Optional client/session hints
  const client = {
    userAgent: `e2e/${RandomGenerator.alphaNumeric(6)}`,
    ip: "127.0.0.1",
    clientPlatform: "node-e2e",
    clientDevice: "ci-runner",
    sessionType: "standard",
  } satisfies IClientContext;

  // 1) First: successful registration
  const authorized = await api.functional.auth.registeredMember.join(
    connection,
    {
      body: {
        email, // lower-case reference value
        username, // lower-case reference value
        password,
        displayName: RandomGenerator.name(1),
        client,
      } satisfies ICommunityPlatformRegisteredMember.IJoin,
    },
  );
  typia.assert(authorized);

  // Prepare a fresh unauthenticated connection for error attempts
  const unauthConn: api.IConnection = { ...connection, headers: {} };

  // 2) Conflict by email (case-insensitive): same email but in uppercase
  const emailUpper = `${localPart.toUpperCase()}@EXAMPLE.COM`;
  const usernameDifferent = `${username}${RandomGenerator.alphabets(2)}`; // different username
  await TestValidator.error(
    "duplicate email with different casing must be rejected",
    async () => {
      await api.functional.auth.registeredMember.join(unauthConn, {
        body: {
          email: emailUpper,
          username: usernameDifferent,
          password,
          displayName: RandomGenerator.name(1),
          client,
        } satisfies ICommunityPlatformRegisteredMember.IJoin,
      });
    },
  );

  // 3) Conflict by username (case-insensitive): same username but in uppercase
  const emailDifferent = `${RandomGenerator.alphabets(10)}@example.com`;
  const usernameUpper = username.toUpperCase();
  await TestValidator.error(
    "duplicate username with different casing must be rejected",
    async () => {
      await api.functional.auth.registeredMember.join(unauthConn, {
        body: {
          email: emailDifferent,
          username: usernameUpper,
          password,
          displayName: RandomGenerator.name(1),
          client,
        } satisfies ICommunityPlatformRegisteredMember.IJoin,
      });
    },
  );
}
