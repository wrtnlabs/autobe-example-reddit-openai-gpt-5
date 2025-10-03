import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IClientContext } from "@ORGANIZATION/PROJECT-api/lib/structures/IClientContext";
import type { ICommunityPlatformRegisteredMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRegisteredMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

/**
 * Successful login for an existing registered member.
 *
 * This E2E test provisions a new registered member account and then performs a
 * login using the same credentials. It validates identity consistency,
 * session/token issuance semantics, and optional user summary timestamps.
 *
 * Steps
 *
 * 1. Join: Create a member with email/username/password and optional client
 *    context
 * 2. Login: Authenticate with identifier (username) and password
 * 3. Validate:
 *
 *    - Principal id remains consistent between join and login
 *    - Access token rotates on login (likely different from join's token)
 *    - Token expiry timestamps are in the future
 *    - If user summaries exist, their ids match principals
 *    - If last_login_at appears in both, login's value is not earlier than join's
 */
export async function test_api_member_login_success_existing_account(
  connection: api.IConnection,
) {
  // Test input generation
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const username: string = `member_${RandomGenerator.alphaNumeric(12)}`;
  const password: string = `Pw_${RandomGenerator.alphaNumeric(12)}`;

  // 1) Join: create a registered member
  const joinBody = {
    email,
    username,
    password,
    displayName: RandomGenerator.name(1),
    client: {
      userAgent: `e2e/${RandomGenerator.alphaNumeric(6)}`,
      clientPlatform: "web-test",
    },
  } satisfies ICommunityPlatformRegisteredMember.IJoin;

  const joined = await api.functional.auth.registeredMember.join(connection, {
    body: joinBody,
  });
  typia.assert(joined);

  // Optional user summary and last_login_at snapshot (may be undefined)
  const joinUser = joined.user;
  const joinLastLogin: (string & tags.Format<"date-time">) | null | undefined =
    joinUser?.last_login_at;

  // 2) Login: authenticate using the username as identifier
  const loginBody = {
    identifier: username,
    password,
  } satisfies ICommunityPlatformRegisteredMember.ILogin;

  const loggedIn = await api.functional.auth.registeredMember.login(
    connection,
    {
      body: loginBody,
    },
  );
  typia.assert(loggedIn);

  // 3) Validations
  // Identity consistency
  TestValidator.equals(
    "member id should be consistent between join and login",
    loggedIn.id,
    joined.id,
  );

  // Token rotation (access token expected to change on new login)
  TestValidator.notEquals(
    "access token should rotate on login",
    loggedIn.token.access,
    joined.token.access,
  );

  // Token expirations: should be in the future
  const accessExp = new Date(loggedIn.token.expired_at).getTime();
  const refreshUntil = new Date(loggedIn.token.refreshable_until).getTime();
  const now = Date.now();
  TestValidator.predicate(
    "access token expiration should be in the future",
    accessExp > now,
  );
  TestValidator.predicate(
    "refresh token window should be in the future",
    refreshUntil > now,
  );

  // Optional user summaries must align with principal ids when present
  if (joined.user) {
    TestValidator.equals(
      "joined.user.id should equal joined principal id",
      joined.user.id,
      joined.id,
    );
  }
  if (loggedIn.user) {
    TestValidator.equals(
      "login.user.id should equal login principal id",
      loggedIn.user.id,
      loggedIn.id,
    );
  }

  // Optional last_login_at progression check when both provided
  const loginUser = loggedIn.user;
  const loginLastLogin: (string & tags.Format<"date-time">) | null | undefined =
    loginUser?.last_login_at;
  if (
    joinLastLogin !== null &&
    joinLastLogin !== undefined &&
    loginLastLogin !== null &&
    loginLastLogin !== undefined
  ) {
    const tJoin = Date.parse(joinLastLogin);
    const tLogin = Date.parse(loginLastLogin);
    TestValidator.predicate(
      "last_login_at should be updated on login (>= join)",
      tLogin >= tJoin,
    );
  }
}
