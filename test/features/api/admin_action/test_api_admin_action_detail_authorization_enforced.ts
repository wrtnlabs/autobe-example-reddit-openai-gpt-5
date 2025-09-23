import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformAdminAction } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformAdminAction";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

/**
 * Enforce authorization on admin action detail endpoint for non-admin users.
 *
 * Business goal: Ensure that a regular community member cannot retrieve
 * administrative action audit records.
 *
 * Steps:
 *
 * 1. Join as a community member using POST /auth/communityMember/join
 *
 *    - Body type: ICommunityPlatformCommunityMember.ICreate
 *    - Response type: ICommunityPlatformCommunityMember.IAuthorized
 * 2. Attempt to GET /communityPlatform/systemAdmin/adminActions/{adminActionId}
 *    using a random UUID.
 * 3. Expect the call to be rejected for non-admins. Per policy, we do not assert
 *    specific HTTP status codes; we only assert that an error occurs.
 * 4. Simulator safety: when connection.simulate === true, the SDK mock does not
 *    enforce permissions. In that case, call once and typia.assert() the random
 *    output to keep the test meaningful without causing false negatives.
 */
export async function test_api_admin_action_detail_authorization_enforced(
  connection: api.IConnection,
) {
  // 1) Join as a community member
  const username: string = `user_${RandomGenerator.alphaNumeric(8)}`;
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const password: string = RandomGenerator.alphaNumeric(12);

  const authorized = await api.functional.auth.communityMember.join(
    connection,
    {
      body: {
        username,
        email,
        password,
      } satisfies ICommunityPlatformCommunityMember.ICreate,
    },
  );
  typia.assert(authorized);

  // 2) Prepare a random admin action id
  const adminActionId: string & tags.Format<"uuid"> = typia.random<
    string & tags.Format<"uuid">
  >();

  // 3) Simulator-aware behavior
  if (connection.simulate === true) {
    // In simulator mode, permissions are not enforced; endpoint returns mock data.
    const sample =
      await api.functional.communityPlatform.systemAdmin.adminActions.at(
        connection,
        { adminActionId },
      );
    typia.assert(sample);
  } else {
    // In real backend mode, non-admin must be rejected.
    await TestValidator.error(
      "non-admin member cannot access admin action detail",
      async () => {
        await api.functional.communityPlatform.systemAdmin.adminActions.at(
          connection,
          { adminActionId },
        );
      },
    );
  }
}
