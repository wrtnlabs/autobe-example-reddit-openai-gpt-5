import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IClientContext } from "@ORGANIZATION/PROJECT-api/lib/structures/IClientContext";
import type { ICommunityPlatformRegisteredMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRegisteredMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

/**
 * Verify a freshly registered member can fetch their own profile via “me”.
 *
 * Steps:
 *
 * 1. Attempt to access the “me” endpoint without authentication → expect error
 * 2. Register a new member (join) which authenticates the shared connection
 * 3. Fetch the current user profile via GET /communityPlatform/registeredMember/me
 * 4. Validate identity and core profile fields match registration input
 * 5. If authorization response includes a user summary, reconcile fields with
 *    profile
 */
export async function test_api_me_profile_success_after_join(
  connection: api.IConnection,
) {
  // 1) Unauthenticated access should fail
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "unauthenticated access to me should fail",
    async () => {
      await api.functional.communityPlatform.registeredMember.me.at(unauthConn);
    },
  );

  // 2) Register a new member (join) to establish an authenticated session
  const email = typia.random<string & tags.Format<"email">>();
  const username = `user_${RandomGenerator.alphabets(8)}`;
  const password = RandomGenerator.alphaNumeric(16);
  const displayName = RandomGenerator.name(1);

  const joinBody = {
    email,
    username,
    password,
    displayName,
    client: {
      userAgent: `e2e/${RandomGenerator.alphaNumeric(6)}`,
      ip: `203.0.113.${Math.floor(Math.random() * 200) + 1}`,
      clientPlatform: "node",
      clientDevice: "ci-runner",
      sessionType: "standard",
    },
  } satisfies ICommunityPlatformRegisteredMember.IJoin;

  const authorized = await api.functional.auth.registeredMember.join(
    connection,
    {
      body: joinBody,
    },
  );
  typia.assert(authorized);

  // 3) Fetch current profile via “me” using the now-authenticated connection
  const me =
    await api.functional.communityPlatform.registeredMember.me.at(connection);
  typia.assert(me);

  // 4) Validate identity consistency and profile content
  TestValidator.equals("me.id must equal authorized.id", me.id, authorized.id);
  TestValidator.equals("me.email equals submitted email", me.email, email);
  TestValidator.equals(
    "me.username equals submitted username",
    me.username,
    username,
  );
  TestValidator.equals(
    "me.displayName equals submitted displayName",
    me.displayName,
    displayName,
  );

  // 5) If authorization response included a user summary, reconcile it
  if (authorized.user) {
    typia.assertGuard(authorized.user!);
    TestValidator.equals(
      "summary.id equals authorized.id",
      authorized.user.id,
      authorized.id,
    );
    TestValidator.equals(
      "summary.username equals profile.username",
      authorized.user.username,
      me.username,
    );
    TestValidator.equals(
      "summary.email equals profile.email",
      authorized.user.email,
      me.email,
    );
    TestValidator.equals(
      "summary.display_name equals profile.displayName",
      authorized.user.display_name,
      me.displayName,
    );
  }
}
