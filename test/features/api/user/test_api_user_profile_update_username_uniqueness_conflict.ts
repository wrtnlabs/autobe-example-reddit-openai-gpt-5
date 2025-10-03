import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IClientContext } from "@ORGANIZATION/PROJECT-api/lib/structures/IClientContext";
import type { ICommunityPlatformRegisteredMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRegisteredMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

export async function test_api_user_profile_update_username_uniqueness_conflict(
  connection: api.IConnection,
) {
  /**
   * Validate case-insensitive uniqueness on username updates.
   *
   * Steps
   *
   * 1. Register User A on the primary connection (token A is stored on this
   *    connection).
   * 2. Register User B on a separate connection (token B on that separate
   *    connection).
   * 3. With User A authenticated, attempt to update A's username to a case-variant
   *    of B's username to trigger a CI uniqueness conflict — expect an error.
   * 4. Ensure no partial update occurred by performing a successful non-username
   *    update (displayName) and verifying A's username remains unchanged.
   */
  // ---------- 1) Register User A ----------
  const aEmail: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const aUsername: string = RandomGenerator.alphaNumeric(10); // 3~30 chars OK
  const aJoin = await api.functional.auth.registeredMember.join(connection, {
    body: {
      email: aEmail,
      username: aUsername,
      password: "P@ssw0rd1234",
    } satisfies ICommunityPlatformRegisteredMember.IJoin,
  });
  typia.assert<ICommunityPlatformRegisteredMember.IAuthorized>(aJoin);
  const aId = aJoin.id; // UUID of User A

  // ---------- 2) Register User B on a separate connection ----------
  const bConn: api.IConnection = { ...connection, headers: {} };
  const bEmail: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const bUsername: string = RandomGenerator.alphaNumeric(10);
  const bJoin = await api.functional.auth.registeredMember.join(bConn, {
    body: {
      email: bEmail,
      username: bUsername,
      password: "P@ssw0rd1234",
    } satisfies ICommunityPlatformRegisteredMember.IJoin,
  });
  typia.assert<ICommunityPlatformRegisteredMember.IAuthorized>(bJoin);

  // ---------- 3) Attempt CI-duplicate username update as User A ----------
  // Create a case-variant of B's username to ensure CI match
  const bUsernameCaseVariant: string = bUsername.toUpperCase();

  await TestValidator.error(
    "duplicate username (case-insensitive) causes update error",
    async () => {
      await api.functional.communityPlatform.registeredMember.users.update(
        connection,
        {
          userId: aId,
          body: {
            username: bUsernameCaseVariant,
          } satisfies ICommunityPlatformUser.IUpdate,
        },
      );
    },
  );

  // ---------- 4) Verify no partial update occurred ----------
  const displayNameAfter: string = RandomGenerator.name(1);
  const after =
    await api.functional.communityPlatform.registeredMember.users.update(
      connection,
      {
        userId: aId,
        body: {
          displayName: displayNameAfter,
        } satisfies ICommunityPlatformUser.IUpdate,
      },
    );
  typia.assert<ICommunityPlatformUser>(after);

  // Username must remain A's original value
  TestValidator.equals(
    "username remains unchanged after failed duplicate attempt",
    after.username,
    aUsername,
  );
}
