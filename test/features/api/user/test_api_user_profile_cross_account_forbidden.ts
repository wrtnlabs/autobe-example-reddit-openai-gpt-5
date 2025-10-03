import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IClientContext } from "@ORGANIZATION/PROJECT-api/lib/structures/IClientContext";
import type { ICommunityPlatformRegisteredMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRegisteredMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

/**
 * Enforce cross-account access restrictions on profile read.
 *
 * Workflow:
 *
 * 1. Create User B on a dedicated connection (connB) via join() to acquire B's
 *    token and id.
 * 2. Create User A on another connection (connA) via join() to acquire A's token.
 * 3. Using User A's token (connA), attempt to read User B's profile by ID; expect
 *    an error (authorization forbids cross-account read).
 * 4. Control: Using User B's token (connB), read B's own profile; expect success
 *    and matching id.
 */
export async function test_api_user_profile_cross_account_forbidden(
  connection: api.IConnection,
) {
  // Prepare two isolated connections (headers managed by SDK after auth)
  const connA: api.IConnection = { ...connection, headers: {} };
  const connB: api.IConnection = { ...connection, headers: {} };

  // 1) Create User B and hold B session on connB
  const joinBodyB = {
    email: typia.random<string & tags.Format<"email">>(),
    username: RandomGenerator.alphabets(10),
    password: RandomGenerator.alphaNumeric(16),
    displayName: RandomGenerator.name(),
  } satisfies ICommunityPlatformRegisteredMember.IJoin;
  const memberB: ICommunityPlatformRegisteredMember.IAuthorized =
    await api.functional.auth.registeredMember.join(connB, {
      body: joinBodyB,
    });
  typia.assert(memberB);

  // 2) Create User A and hold A session on connA
  const joinBodyA = {
    email: typia.random<string & tags.Format<"email">>(),
    username: RandomGenerator.alphabets(10),
    password: RandomGenerator.alphaNumeric(16),
    displayName: RandomGenerator.name(),
  } satisfies ICommunityPlatformRegisteredMember.IJoin;
  const memberA: ICommunityPlatformRegisteredMember.IAuthorized =
    await api.functional.auth.registeredMember.join(connA, {
      body: joinBodyA,
    });
  typia.assert(memberA);

  // 3) Cross-account access must fail: User A reading User B's profile
  await TestValidator.error(
    "cross-account profile read should be forbidden",
    async () => {
      await api.functional.communityPlatform.registeredMember.users.at(connA, {
        userId: memberB.id,
      });
    },
  );

  // 4) Control: User B can read own profile successfully
  const ownProfile: ICommunityPlatformUser =
    await api.functional.communityPlatform.registeredMember.users.at(connB, {
      userId: memberB.id,
    });
  typia.assert(ownProfile);
  TestValidator.equals(
    "self profile read returns matching id",
    ownProfile.id,
    memberB.id,
  );
}
