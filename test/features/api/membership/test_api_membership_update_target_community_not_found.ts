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

/**
 * Validate not-found handling when updating membership for a non-existent
 * community.
 *
 * Business context:
 *
 * - A registered member can join/leave existing communities by name. When the
 *   target community cannot be resolved by name, the server should reject the
 *   request with a not-found style error.
 *
 * Test steps:
 *
 * 1. Register a new member (acquire authenticated session via join API).
 * 2. Attempt to join a non-existent community using a valid-by-format name.
 * 3. Verify the request fails (error thrown) without asserting status codes.
 * 4. Repeat with join=false to ensure consistent not-found handling.
 */
export async function test_api_membership_update_target_community_not_found(
  connection: api.IConnection,
) {
  // 1) Register a new member to authenticate the session
  const authorized: ICommunityPlatformRegisteredMember.IAuthorized =
    await api.functional.auth.registeredMember.join(connection, {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        username: `user_${RandomGenerator.alphaNumeric(12)}`,
        password: `Pw_${RandomGenerator.alphaNumeric(16)}`,
        displayName: RandomGenerator.name(1),
        client: {
          userAgent: `e2e-membership/${RandomGenerator.alphaNumeric(6)}`,
        },
      } satisfies ICommunityPlatformRegisteredMember.IJoin,
    });
  typia.assert(authorized);

  // 2) Compose a valid-by-format but non-existent community name
  const communityName = typia.assert<
    string &
      tags.MinLength<3> &
      tags.MaxLength<30> &
      tags.Pattern<"^[A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])$">
  >(`nonexist${RandomGenerator.alphaNumeric(12)}`);

  // 3) Attempt to join non-existent community -> expect error
  await TestValidator.error(
    "joining a non-existent community should throw an error",
    async () => {
      await api.functional.communityPlatform.registeredMember.communities.membership.update(
        connection,
        {
          communityName,
          body: {
            join: true,
          } satisfies ICommunityPlatformCommunityMember.IUpdate,
        },
      );
    },
  );

  // 4) Attempt to leave non-existent community -> expect error as well
  await TestValidator.error(
    "leaving a non-existent community should throw an error",
    async () => {
      await api.functional.communityPlatform.registeredMember.communities.membership.update(
        connection,
        {
          communityName,
          body: {
            join: false,
          } satisfies ICommunityPlatformCommunityMember.IUpdate,
        },
      );
    },
  );
}
