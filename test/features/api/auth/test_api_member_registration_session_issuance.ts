import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IClientContext } from "@ORGANIZATION/PROJECT-api/lib/structures/IClientContext";
import type { ICommunityPlatformRegisteredMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRegisteredMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

export async function test_api_member_registration_session_issuance(
  connection: api.IConnection,
) {
  /**
   * Register a new member and receive an authorization session immediately.
   *
   * Steps:
   *
   * 1. Prepare a valid registration payload using
   *    ICommunityPlatformRegisteredMember.IJoin.
   * 2. Call POST /auth/registeredMember/join and receive IAuthorized with token.
   * 3. Assert response type strictly with typia.assert.
   * 4. Minimal business checks that are simulation-safe:
   *
   *    - Token.access and token.refresh are non-empty strings and differ.
   *
   * Notes:
   *
   * - Session persistence to the connection is automatically performed by the
   *   SDK.
   * - Never touch connection.headers in tests (absolute prohibition).
   */

  // 1) Prepare request body with valid values
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const username: string = `user_${RandomGenerator.alphaNumeric(12)}`;
  const password: string = `${RandomGenerator.alphaNumeric(16)}!`;
  const displayName: string = RandomGenerator.name();

  const client = {
    userAgent: `e2e/${RandomGenerator.alphaNumeric(6)}`,
    ip: "127.0.0.1",
    clientPlatform: "node-e2e",
    clientDevice: "CI",
    sessionType: "standard",
  } satisfies IClientContext;

  const body = {
    email,
    username,
    password,
    displayName,
    client,
  } satisfies ICommunityPlatformRegisteredMember.IJoin;

  // 2) Execute API call
  const authorized = await api.functional.auth.registeredMember.join(
    connection,
    {
      body,
    },
  );

  // 3) Type-level validation of the response structure
  typia.assert<ICommunityPlatformRegisteredMember.IAuthorized>(authorized);

  // 4) Minimal, simulation-safe business checks
  TestValidator.predicate(
    "access token should be a non-empty string",
    authorized.token.access.length > 0,
  );
  TestValidator.predicate(
    "refresh token should be a non-empty string",
    authorized.token.refresh.length > 0,
  );
  TestValidator.notEquals(
    "access and refresh tokens must differ",
    authorized.token.access,
    authorized.token.refresh,
  );
}
