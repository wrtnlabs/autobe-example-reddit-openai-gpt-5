import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

/**
 * Community member can login with email and password and receive fresh tokens.
 *
 * Business flow
 *
 * 1. Register a new community member (join) with unique username/email and a valid
 *    password
 * 2. Login using email + password
 * 3. Validate:
 *
 *    - Response types (IAuthorized)
 *    - Same subject id between join and login
 *    - Token rotation: access/refresh tokens differ between join and login
 *    - Last_login_at is present in the login response's user snapshot
 *
 * Security/infra notes
 *
 * - Do not manipulate connection.headers; SDK updates Authorization automatically
 * - Use exact DTO variants: ICreate for join, ILogin.IByEmail for login
 */
export async function test_api_community_member_login_success_with_email(
  connection: api.IConnection,
) {
  // 1) Prepare unique credentials for the new member
  const username: string = `member_${RandomGenerator.alphaNumeric(12)}`;
  const email: string = typia.random<string & tags.Format<"email">>();
  const password: string = `Pw_${RandomGenerator.alphaNumeric(10)}`; // >= 8 chars

  // 2) Register (join) the member
  const joinBody = {
    username,
    email,
    password,
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const joined = await api.functional.auth.communityMember.join(connection, {
    body: joinBody,
  });
  typia.assert<ICommunityPlatformCommunityMember.IAuthorized>(joined);

  // 3) Login by email
  const loginBody = {
    email: joinBody.email,
    password: joinBody.password,
  } satisfies ICommunityPlatformCommunityMember.ILogin.IByEmail;
  const loggedIn = await api.functional.auth.communityMember.login(connection, {
    body: loginBody,
  });
  typia.assert<ICommunityPlatformCommunityMember.IAuthorized>(loggedIn);

  // 4) Business validations
  // 4-1) Same subject id across join and login
  TestValidator.equals(
    "subject id should remain consistent across join and subsequent login",
    loggedIn.id,
    joined.id,
  );

  // 4-2) Token rotation indicates a new session created on login
  TestValidator.notEquals(
    "refresh token should rotate on successful login (new session)",
    loggedIn.token.refresh,
    joined.token.refresh,
  );
  TestValidator.notEquals(
    "access token should differ between join and login",
    loggedIn.token.access,
    joined.token.access,
  );

  // 4-3) last_login_at should be set after successful login
  const hasLoginAt: boolean =
    loggedIn.user !== undefined &&
    loggedIn.user.last_login_at !== null &&
    loggedIn.user.last_login_at !== undefined;
  TestValidator.predicate(
    "last_login_at should be present in user snapshot after login",
    hasLoginAt,
  );
}
