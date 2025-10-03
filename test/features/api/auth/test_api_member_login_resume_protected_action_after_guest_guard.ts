import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IClientContext } from "@ORGANIZATION/PROJECT-api/lib/structures/IClientContext";
import type { ICommunityPlatformRegisteredMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRegisteredMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

/**
 * Validate member login and continuity after guest state using available auth
 * endpoints.
 *
 * Business context:
 *
 * - A guest cannot perform member-only actions until authenticated. With only
 *   auth endpoints provided in this SDK scope, we demonstrate the
 *   resume-after-login behavior by obtaining an authorization context via login
 *   on a clean (guest) connection and confirming the principal identity
 *   continuity with the previously joined account.
 *
 * Steps:
 *
 * 1. Prepare unique credentials and optional client context.
 * 2. Join a new registered member on a clean unauthenticated connection.
 * 3. Login from a separate clean unauthenticated connection using username as
 *    identifier.
 * 4. Verify joined id equals logged-in id (principal continuity).
 * 5. Negative path: login fails with incorrect password (error expected; no
 *    status/message assertions).
 * 6. Optional: login again using email as identifier; verify id continuity.
 */
export async function test_api_member_login_resume_protected_action_after_guest_guard(
  connection: api.IConnection,
) {
  // 1) Prepare credentials and optional client context
  const email = typia.random<string & tags.Format<"email">>();
  const username = `member_${RandomGenerator.alphaNumeric(12)}`;
  const password = RandomGenerator.alphaNumeric(16);

  const joinBody = {
    email,
    username,
    password,
    displayName: RandomGenerator.name(),
    client: {
      userAgent: "e2e-tests",
      ip: "127.0.0.1",
      clientPlatform: "node",
      clientDevice: "ci",
      sessionType: "standard",
    } satisfies IClientContext,
  } satisfies ICommunityPlatformRegisteredMember.IJoin;

  // 2) Join on a clean unauthenticated connection
  const connForJoin: api.IConnection = { ...connection, headers: {} };
  const authorizedOnJoin = await api.functional.auth.registeredMember.join(
    connForJoin,
    {
      body: joinBody,
    },
  );
  typia.assert(authorizedOnJoin);

  // 3) Login on a separate clean unauthenticated connection using username
  const connForLogin: api.IConnection = { ...connection, headers: {} };
  const loginByUsername = {
    identifier: username,
    password,
  } satisfies ICommunityPlatformRegisteredMember.ILogin;

  const authorizedOnLogin = await api.functional.auth.registeredMember.login(
    connForLogin,
    { body: loginByUsername },
  );
  typia.assert(authorizedOnLogin);

  // 4) Principal continuity: joined id === login id
  TestValidator.equals(
    "joined and logged-in IDs should match",
    authorizedOnLogin.id,
    authorizedOnJoin.id,
  );
  if (authorizedOnLogin.user !== undefined) {
    TestValidator.equals(
      "user summary id aligns with authorized id (if provided)",
      authorizedOnLogin.user.id,
      authorizedOnLogin.id,
    );
  }

  // 5) Negative path: wrong password must fail (async error assertion)
  const wrongLoginBody = {
    identifier: email,
    password: `${password}_wrong`,
  } satisfies ICommunityPlatformRegisteredMember.ILogin;
  const connForFail: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "login must fail with incorrect password",
    async () => {
      await api.functional.auth.registeredMember.login(connForFail, {
        body: wrongLoginBody,
      });
    },
  );

  // 6) Optional: Login again using email identifier and verify continuity
  const connForLoginByEmail: api.IConnection = { ...connection, headers: {} };
  const loginByEmail = {
    identifier: email,
    password,
  } satisfies ICommunityPlatformRegisteredMember.ILogin;

  const authorizedByEmail = await api.functional.auth.registeredMember.login(
    connForLoginByEmail,
    { body: loginByEmail },
  );
  typia.assert(authorizedByEmail);
  TestValidator.equals(
    "login by email returns same principal id",
    authorizedByEmail.id,
    authorizedOnJoin.id,
  );
}
