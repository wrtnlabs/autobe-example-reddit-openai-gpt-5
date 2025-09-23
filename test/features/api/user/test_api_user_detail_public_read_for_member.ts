import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

/**
 * Public read of a community member's identity by userId (no auth required) and
 * stability across auth state.
 *
 * Purpose:
 *
 * - Ensure GET /communityPlatform/users/{userId} is publicly accessible (no
 *   Authorization header)
 * - Validate response conforms to ICommunityPlatformUser with only public-safe
 *   fields
 * - Confirm response is identical whether Authorization header is present or not
 *
 * Steps:
 *
 * 1. Create a new community member via POST /auth/communityMember/join to get a
 *    fresh userId
 * 2. Call GET /communityPlatform/users/{userId} with an unauthenticated connection
 *    and validate response
 * 3. Call the same GET with the authenticated connection and compare results for
 *    equality
 */
export async function test_api_user_detail_public_read_for_member(
  connection: api.IConnection,
) {
  // 1) Create a new community member and capture userId
  const joinBody = {
    username: RandomGenerator.name(1),
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformCommunityMember.ICreate;

  const authorized = await api.functional.auth.communityMember.join(
    connection,
    {
      body: joinBody,
    },
  );
  typia.assert<ICommunityPlatformCommunityMember.IAuthorized>(authorized);

  const userId = authorized.id; // UUID of the created user

  // 2) Public read without Authorization: use a fresh connection with empty headers
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  const publicUser = await api.functional.communityPlatform.users.at(
    unauthConn,
    {
      userId,
    },
  );
  typia.assert<ICommunityPlatformUser>(publicUser);

  // Basic business validations on public payload
  TestValidator.equals(
    "fetched id matches created member id (unauthenticated)",
    publicUser.id,
    userId,
  );
  TestValidator.predicate(
    "username is non-empty",
    publicUser.username.length > 0,
  );
  TestValidator.predicate("status is non-empty", publicUser.status.length > 0);
  TestValidator.predicate(
    "created_at is present",
    typeof publicUser.created_at === "string" &&
      publicUser.created_at.length > 0,
  );
  TestValidator.predicate(
    "updated_at is present",
    typeof publicUser.updated_at === "string" &&
      publicUser.updated_at.length > 0,
  );

  // Ensure no sensitive internals are exposed (token/email/password should not exist)
  const keys = Object.keys(publicUser);
  TestValidator.predicate(
    "no token field exposed",
    keys.includes("token") === false,
  );
  TestValidator.predicate(
    "no email field exposed",
    keys.includes("email") === false,
  );
  TestValidator.predicate(
    "no password field exposed",
    keys.includes("password") === false,
  );

  // 3) Read with Authorization: use the (now) authenticated connection
  const authedUser = await api.functional.communityPlatform.users.at(
    connection,
    {
      userId,
    },
  );
  typia.assert<ICommunityPlatformUser>(authedUser);

  // The public response must be identical regardless of Authorization header
  TestValidator.equals(
    "public read identical regardless of Authorization header",
    authedUser,
    publicUser,
  );
}
