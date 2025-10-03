import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IClientContext } from "@ORGANIZATION/PROJECT-api/lib/structures/IClientContext";
import type { ICommunityPlatformRegisteredMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRegisteredMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

/**
 * Ensure cross-account user deactivation is forbidden while self-deactivation
 * is allowed.
 *
 * Business flow:
 *
 * 1. Create two distinct registered members (User A and User B) using join.
 * 2. With User A's authenticated connection, attempt to DELETE User B by ID →
 *    expect an error (forbidden action).
 * 3. With User B's authenticated connection, self-delete User B → success
 *    (void/204).
 *
 * Notes:
 *
 * - Two separate IConnection instances are used so that the SDK manages
 *   Authorization tokens independently (no manual header manipulation).
 * - Type safety is enforced with `satisfies` on request bodies and typia.assert
 *   on non-void responses.
 */
export async function test_api_user_account_deactivation_cross_account_forbidden(
  connection: api.IConnection,
) {
  // Prepare two isolated connections so each user keeps its own session state.
  const connA: api.IConnection = { ...connection, headers: {} };
  const connB: api.IConnection = { ...connection, headers: {} };

  // 1) Join User A
  const joinBodyA = {
    email: typia.random<string & tags.Format<"email">>(),
    username: `user_${RandomGenerator.alphaNumeric(12)}`,
    password: `P@ss${RandomGenerator.alphaNumeric(10)}`,
    displayName: RandomGenerator.name(),
  } satisfies ICommunityPlatformRegisteredMember.IJoin;
  const authA: ICommunityPlatformRegisteredMember.IAuthorized =
    await api.functional.auth.registeredMember.join(connA, { body: joinBodyA });
  typia.assert(authA);

  // 1) Join User B
  const joinBodyB = {
    email: typia.random<string & tags.Format<"email">>(),
    username: `user_${RandomGenerator.alphaNumeric(12)}`,
    password: `P@ss${RandomGenerator.alphaNumeric(10)}`,
    displayName: RandomGenerator.name(),
  } satisfies ICommunityPlatformRegisteredMember.IJoin;
  const authB: ICommunityPlatformRegisteredMember.IAuthorized =
    await api.functional.auth.registeredMember.join(connB, { body: joinBodyB });
  typia.assert(authB);

  // Sanity: User IDs must be distinct
  TestValidator.notEquals(
    "distinct user ids between A and B",
    authA.id,
    authB.id,
  );

  // 2) Cross-account deactivation attempt: A tries to delete B → expect error
  await TestValidator.error(
    "cross-account deactivation must be forbidden",
    async () => {
      await api.functional.communityPlatform.registeredMember.users.erase(
        connA,
        { userId: authB.id },
      );
    },
  );

  // 3) Control: B self-deletes → success (void/204)
  await api.functional.communityPlatform.registeredMember.users.erase(connB, {
    userId: authB.id,
  });
}
