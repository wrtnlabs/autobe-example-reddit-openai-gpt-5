import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IClientContext } from "@ORGANIZATION/PROJECT-api/lib/structures/IClientContext";
import type { ICommunityPlatformRegisteredMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRegisteredMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

/**
 * After account deactivation, the authenticated session must no longer yield an
 * active current-user profile via GET /communityPlatform/registeredMember/me.
 *
 * Business flow
 *
 * 1. Register a new member (join) and obtain an authenticated session
 * 2. Fetch current profile via /me and verify the identity matches the joined id
 * 3. Deactivate the same account via DELETE /registeredMember/users/{userId}
 * 4. Re-attempt /me using the same session; expect an error due to revoked session
 *
 * Notes
 *
 * - Use ICommunityPlatformRegisteredMember.IJoin for registration body
 * - Validate response structures with typia.assert
 * - Do NOT check specific HTTP status codes/messages; only ensure error occurs
 * - Never touch connection.headers (SDK manages auth token automatically)
 */
export async function test_api_me_profile_after_account_deactivation(
  connection: api.IConnection,
) {
  // 1) Register a new member and obtain session
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    username: RandomGenerator.alphabets(12),
    password: RandomGenerator.alphaNumeric(16),
    displayName: RandomGenerator.name(1),
  } satisfies ICommunityPlatformRegisteredMember.IJoin;

  const authorized = await api.functional.auth.registeredMember.join(
    connection,
    {
      body: joinBody,
    },
  );
  typia.assert(authorized);

  // 2) Fetch /me and verify identity
  const me =
    await api.functional.communityPlatform.registeredMember.me.at(connection);
  typia.assert(me);
  TestValidator.equals(
    "current user id matches authorized id before deactivation",
    me.id,
    authorized.id,
  );

  // 3) Deactivate the account
  await api.functional.communityPlatform.registeredMember.users.erase(
    connection,
    { userId: authorized.id },
  );

  // 4) /me must not be accessible anymore with the same session
  await TestValidator.error(
    "me endpoint should fail after account deactivation (session revoked)",
    async () => {
      await api.functional.communityPlatform.registeredMember.me.at(connection);
    },
  );
}
