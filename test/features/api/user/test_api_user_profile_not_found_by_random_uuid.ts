import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IClientContext } from "@ORGANIZATION/PROJECT-api/lib/structures/IClientContext";
import type { ICommunityPlatformRegisteredMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRegisteredMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

/**
 * Validate not-found handling when querying a user profile by a random UUID.
 *
 * Steps
 *
 * 1. Register a member (join) to obtain an authenticated session. The SDK sets
 *    Authorization headers automatically.
 * 2. Positive control: fetch own profile using the returned principal id and
 *    validate the response shape and id equality.
 * 3. Generate a random UUID distinct from the authenticated user’s id and try to
 *    fetch it; expect an error (not found or equivalent).
 *
 * Validation strategy
 *
 * - Use typia.assert() for runtime response validation.
 * - Use TestValidator.equals() for ID equality (actual-first pattern).
 * - Use TestValidator.error() for the not-found (or equivalent) error case. Do
 *   not assert specific HTTP status codes or messages.
 */
export async function test_api_user_profile_not_found_by_random_uuid(
  connection: api.IConnection,
) {
  // 1) Register a member (join) to authenticate
  const client = {
    userAgent: "e2e-test",
    clientPlatform: "node",
    clientDevice: "jest",
    sessionType: "standard",
  } satisfies IClientContext;
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    username: RandomGenerator.alphabets(12),
    password: RandomGenerator.alphaNumeric(16),
    displayName: RandomGenerator.name(1),
    client,
  } satisfies ICommunityPlatformRegisteredMember.IJoin;

  const authorized: ICommunityPlatformRegisteredMember.IAuthorized =
    await api.functional.auth.registeredMember.join(connection, {
      body: joinBody,
    });
  typia.assert(authorized);

  // 2) Positive control: fetch own profile
  const me: ICommunityPlatformUser =
    await api.functional.communityPlatform.registeredMember.users.at(
      connection,
      { userId: authorized.id },
    );
  typia.assert(me);
  TestValidator.equals(
    "self profile id equals principal id",
    me.id,
    authorized.id,
  );

  // 3) Not-found scenario: generate a random UUID distinct from current user id
  let randomUserId: string & tags.Format<"uuid"> = typia.random<
    string & tags.Format<"uuid">
  >();
  if (randomUserId === authorized.id)
    randomUserId = typia.random<string & tags.Format<"uuid">>();

  await TestValidator.error(
    "non-existent userId should raise an error (not found or equivalent)",
    async () => {
      await api.functional.communityPlatform.registeredMember.users.at(
        connection,
        { userId: randomUserId },
      );
    },
  );
}
