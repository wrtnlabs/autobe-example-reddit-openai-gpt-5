import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IClientContext } from "@ORGANIZATION/PROJECT-api/lib/structures/IClientContext";
import type { ICommunityPlatformRegisteredMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRegisteredMember";
import type { ICommunityPlatformSession } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSession";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformSession } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformSession";

/**
 * Revoke all active sessions for the current member and validate access denial
 * afterward.
 *
 * Flow:
 *
 * 1. Join as a new registered member (establishes initial session and token in
 *    SDK-managed connection).
 * 2. Verify access to a protected endpoint (GET me) and observe sessions list.
 * 3. Call logoutAll to revoke all sessions.
 * 4. Attempt protected calls again with the same connection (still carrying the
 *    old token) and expect errors.
 * 5. Call logoutAll once more; expect error due to lack of authentication
 *    (pragmatic idempotency check without re-login API).
 */
export async function test_api_auth_logout_all_devices_revocation(
  connection: api.IConnection,
) {
  // 1) Join to create a member and establish an authenticated session
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const username: string = `member_${RandomGenerator.alphaNumeric(12)}`;
  const password: string = `Pw_${RandomGenerator.alphaNumeric(10)}`;

  const joinBody = {
    email,
    username,
    password,
    displayName: RandomGenerator.name(),
    client: {
      userAgent: `E2E-Test/${RandomGenerator.alphaNumeric(6)}`,
    } satisfies IClientContext,
  } satisfies ICommunityPlatformRegisteredMember.IJoin;

  const authorized: ICommunityPlatformRegisteredMember.IAuthorized =
    await api.functional.auth.registeredMember.join(connection, {
      body: joinBody,
    });
  typia.assert(authorized);

  // 2) Verify we can access the protected endpoint (me)
  const me: ICommunityPlatformUser =
    await api.functional.communityPlatform.registeredMember.me.at(connection);
  typia.assert(me);

  // Observe sessions list (expect at least one session present)
  const page: IPageICommunityPlatformSession =
    await api.functional.communityPlatform.registeredMember.me.sessions.index(
      connection,
    );
  typia.assert(page);
  TestValidator.predicate(
    "pre-logout: should have at least one session",
    page.data.length >= 1 || page.pagination.records >= 1,
  );

  // 3) Revoke all sessions
  const result =
    await api.functional.auth.registeredMember.logoutAll(connection);
  typia.assert(result);

  // 4) Using the same connection (bearing the old token), protected endpoints must now error
  await TestValidator.error(
    "post-logout: protected 'me' endpoint should fail",
    async () => {
      await api.functional.communityPlatform.registeredMember.me.at(connection);
    },
  );

  await TestValidator.error(
    "post-logout: sessions listing should fail",
    async () => {
      await api.functional.communityPlatform.registeredMember.me.sessions.index(
        connection,
      );
    },
  );

  // 5) Repeat logoutAll with the revoked token to ensure no side effects (expect failure without re-authentication)
  await TestValidator.error(
    "second logoutAll with revoked token should fail (no side effects)",
    async () => {
      await api.functional.auth.registeredMember.logoutAll(connection);
    },
  );
}
