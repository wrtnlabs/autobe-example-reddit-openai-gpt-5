import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

/**
 * Username-based login success flow for community members.
 *
 * This test validates that a community member can authenticate using the
 * username + password strategy and that the platform issues a new token bundle
 * while updating last_login_at. It also ensures identity consistency (same
 * subject id as the joined member) and that the hydrated user object (when
 * present) matches the created username.
 *
 * Steps:
 *
 * 1. Register a new member with unique username/email and a valid password.
 * 2. Perform login using username + password.
 * 3. Validate:
 *
 *    - Response shapes (IAuthorized with token bundle) via typia.assert.
 *    - Subject id remains the same between join and login.
 *    - A fresh access token is issued (different from the join token).
 *    - Last_login_at becomes set after login and is not older than prior value.
 *    - If user is hydrated, returned username equals the created username.
 */
export async function test_api_community_member_login_success_with_username(
  connection: api.IConnection,
) {
  // 1) Register a new member
  const username: string = RandomGenerator.alphabets(12);
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const password: string = RandomGenerator.alphaNumeric(12); // satisfies MinLength<8>

  const createBody = {
    username,
    email,
    password,
  } satisfies ICommunityPlatformCommunityMember.ICreate;

  const joined = await api.functional.auth.communityMember.join(connection, {
    body: createBody,
  });
  typia.assert<ICommunityPlatformCommunityMember.IAuthorized>(joined);

  // Gather baseline values
  const joinedId: string & tags.Format<"uuid"> = joined.id;
  const preLastLoginAt: (string & tags.Format<"date-time">) | null =
    joined.user?.last_login_at ?? null;
  const preAccess: string = joined.token.access;

  // 2) Login with username + password
  const loginBody = {
    username,
    password,
  } satisfies ICommunityPlatformCommunityMember.ILogin.IByUsername;

  const loggedIn = await api.functional.auth.communityMember.login(connection, {
    body: loginBody,
  });
  typia.assert<ICommunityPlatformCommunityMember.IAuthorized>(loggedIn);

  // 3) Business validations
  // Identity consistency
  TestValidator.equals(
    "login returns the same subject id as join",
    loggedIn.id,
    joinedId,
  );

  // Fresh token issuance
  TestValidator.notEquals(
    "access token after login should differ from the one issued at join",
    loggedIn.token.access,
    preAccess,
  );

  // last_login_at set and not older than previous value
  const postLastLoginAt: (string & tags.Format<"date-time">) | null =
    loggedIn.user?.last_login_at ?? null;
  TestValidator.predicate(
    "last_login_at should be set after login",
    postLastLoginAt !== null,
  );
  if (preLastLoginAt !== null && postLastLoginAt !== null) {
    TestValidator.predicate(
      "last_login_at after login should be newer or equal",
      Date.parse(postLastLoginAt) >= Date.parse(preLastLoginAt),
    );
  }

  // Hydrated user username should match
  if (loggedIn.user !== undefined && loggedIn.user !== null) {
    TestValidator.equals(
      "hydrated user.username matches created username",
      loggedIn.user.username,
      username,
    );
  }
}
