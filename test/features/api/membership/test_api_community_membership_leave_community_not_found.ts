import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IClientContext } from "@ORGANIZATION/PROJECT-api/lib/structures/IClientContext";
import type { ICommunityPlatformRegisteredMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRegisteredMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

export async function test_api_community_membership_leave_community_not_found(
  connection: api.IConnection,
) {
  /**
   * Attempt to leave a non-existent community while authenticated.
   *
   * Steps
   *
   * 1. Register a new member to obtain an authenticated session.
   * 2. Call DELETE on a clearly non-existent community name.
   * 3. Assert that the operation fails (error is thrown). Do not check HTTP status
   *    codes.
   */

  // 1) Register a new member (authenticate)
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    username: RandomGenerator.alphabets(12),
    password: RandomGenerator.alphaNumeric(16),
    // displayName optional; include for variety
    displayName: RandomGenerator.name(),
  } satisfies ICommunityPlatformRegisteredMember.IJoin;

  const authorized: ICommunityPlatformRegisteredMember.IAuthorized =
    await api.functional.auth.registeredMember.join(connection, {
      body: joinBody,
    });
  typia.assert(authorized);

  // 2) Compose a clearly non-existent community name
  const nonexistentCommunity: string = `zzz-no-such-community-${RandomGenerator.alphaNumeric(12)}`;

  // 3) Expect an error when trying to leave a non-existent community membership
  await TestValidator.error(
    "leaving membership on non-existent community must fail",
    async () => {
      await api.functional.communityPlatform.registeredMember.communities.membership.erase(
        connection,
        { communityName: nonexistentCommunity },
      );
    },
  );
}
