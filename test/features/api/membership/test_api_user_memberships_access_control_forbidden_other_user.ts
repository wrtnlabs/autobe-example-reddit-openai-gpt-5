import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IClientContext } from "@ORGANIZATION/PROJECT-api/lib/structures/IClientContext";
import type { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformRegisteredMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRegisteredMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

export async function test_api_user_memberships_access_control_forbidden_other_user(
  connection: api.IConnection,
) {
  /**
   * Validate that a registered member cannot fetch another user’s memberships.
   *
   * Steps:
   *
   * 1. Create User A (join) and capture userId_A
   * 2. Create User B (join) so the connection is authenticated as B
   * 3. SELF-ACCESS: As B, list memberships for B → success (type-checked)
   * 4. CROSS-ACCESS: As B, try to list memberships for A → must error (forbidden)
   *
   * Notes:
   *
   * - SDK auto-manages Authorization on join; never touch headers directly.
   * - Do not assert specific HTTP status codes; only assert that an error occurs
   *   for cross-user access attempt.
   */

  // 1) Create User A (join) - connection becomes authenticated as A
  const joinBodyA = {
    email: typia.random<string & tags.Format<"email">>(),
    username: RandomGenerator.alphabets(12),
    password: RandomGenerator.alphaNumeric(12),
    displayName: RandomGenerator.name(1),
    client: {
      userAgent: `e2e-test/${RandomGenerator.alphaNumeric(6)}`,
      clientPlatform: "node-e2e",
      sessionType: "standard",
    },
  } satisfies ICommunityPlatformRegisteredMember.IJoin;
  const authorizedA = await api.functional.auth.registeredMember.join(
    connection,
    {
      body: joinBodyA,
    },
  );
  typia.assert(authorizedA);

  // 2) Create User B (join) - connection auth switches to B automatically
  const joinBodyB = {
    email: typia.random<string & tags.Format<"email">>(),
    username: RandomGenerator.alphabets(12),
    password: RandomGenerator.alphaNumeric(12),
    displayName: RandomGenerator.name(1),
    client: {
      userAgent: `e2e-test/${RandomGenerator.alphaNumeric(6)}`,
      clientPlatform: "node-e2e",
      sessionType: "standard",
    },
  } satisfies ICommunityPlatformRegisteredMember.IJoin;
  const authorizedB = await api.functional.auth.registeredMember.join(
    connection,
    {
      body: joinBodyB,
    },
  );
  typia.assert(authorizedB);

  // 3) SELF-ACCESS: as B, list B's own memberships → should succeed
  const myList =
    await api.functional.communityPlatform.registeredMember.users.memberships.index(
      connection,
      { userId: authorizedB.id },
    );
  typia.assert(myList);

  // 4) CROSS-ACCESS: as B, attempt to list A's memberships → must error
  await TestValidator.error(
    "other user cannot access another user's memberships",
    async () => {
      await api.functional.communityPlatform.registeredMember.users.memberships.index(
        connection,
        { userId: authorizedA.id },
      );
    },
  );
}
