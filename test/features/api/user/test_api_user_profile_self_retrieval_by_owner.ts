import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IClientContext } from "@ORGANIZATION/PROJECT-api/lib/structures/IClientContext";
import type { ICommunityPlatformRegisteredMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRegisteredMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

/**
 * Self profile retrieval by owner and cross-user access guard.
 *
 * This test verifies that:
 *
 * 1. A newly joined registered member can retrieve their own profile by ID.
 * 2. The returned profile contains only non-sensitive fields and correct values.
 * 3. A different authenticated member cannot read someone else’s profile.
 *
 * Steps
 *
 * 1. Join as member A, capture authorized id and registration inputs
 * 2. GET users/:userId with A's token for A.id → success
 *
 *    - Assert id equality with path (self), email/username/displayName match inputs
 * 3. Join as member B (connection switches auth automatically)
 * 4. Attempt GET users/:userId for A.id while authenticated as B → must error
 * 5. GET users/:userId for B.id → success and id matches
 */
export async function test_api_user_profile_self_retrieval_by_owner(
  connection: api.IConnection,
) {
  // 1) Register member A
  const joinBodyA = {
    email: typia.random<string & tags.Format<"email">>(),
    username: `user_${RandomGenerator.alphaNumeric(12)}`,
    password: RandomGenerator.alphaNumeric(16),
    displayName: RandomGenerator.name(1),
    client: {
      userAgent: `e2e/${RandomGenerator.alphaNumeric(6)}`,
      ip: "127.0.0.1",
      clientPlatform: "e2e-tests",
      clientDevice: "node",
      sessionType: "standard",
    },
  } satisfies ICommunityPlatformRegisteredMember.IJoin;

  const authorizedA: ICommunityPlatformRegisteredMember.IAuthorized =
    await api.functional.auth.registeredMember.join(connection, {
      body: joinBodyA,
    });
  typia.assert(authorizedA);

  // 2) Self-profile read for A (authenticated as A)
  const userA: ICommunityPlatformUser =
    await api.functional.communityPlatform.registeredMember.users.at(
      connection,
      { userId: authorizedA.id },
    );
  typia.assert(userA);

  TestValidator.equals(
    "self-read returns matching id",
    userA.id,
    authorizedA.id,
  );
  TestValidator.equals(
    "returned email equals registration input",
    userA.email,
    joinBodyA.email,
  );
  TestValidator.equals(
    "returned username equals registration input",
    userA.username,
    joinBodyA.username,
  );
  TestValidator.equals(
    "returned displayName equals registration input (null-safe)",
    userA.displayName ?? null,
    joinBodyA.displayName ?? null,
  );

  // 3) Register member B (auth context switches to B via SDK)
  const joinBodyB = {
    email: typia.random<string & tags.Format<"email">>(),
    username: `user_${RandomGenerator.alphaNumeric(12)}`,
    password: RandomGenerator.alphaNumeric(16),
    displayName: RandomGenerator.name(1),
    client: {
      userAgent: `e2e/${RandomGenerator.alphaNumeric(6)}`,
      ip: "127.0.0.1",
      clientPlatform: "e2e-tests",
      clientDevice: "node",
      sessionType: "standard",
    },
  } satisfies ICommunityPlatformRegisteredMember.IJoin;

  const authorizedB: ICommunityPlatformRegisteredMember.IAuthorized =
    await api.functional.auth.registeredMember.join(connection, {
      body: joinBodyB,
    });
  typia.assert(authorizedB);

  // 4) Cross-user read should fail (B attempting to read A)
  await TestValidator.error("cross-user read is forbidden", async () => {
    await api.functional.communityPlatform.registeredMember.users.at(
      connection,
      { userId: authorizedA.id },
    );
  });

  // 5) Self-profile read for B should succeed
  const userB: ICommunityPlatformUser =
    await api.functional.communityPlatform.registeredMember.users.at(
      connection,
      { userId: authorizedB.id },
    );
  typia.assert(userB);
  TestValidator.equals(
    "self-read (B) returns matching id",
    userB.id,
    authorizedB.id,
  );
}
