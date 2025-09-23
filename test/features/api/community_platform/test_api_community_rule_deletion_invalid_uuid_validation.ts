import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

export async function test_api_community_rule_deletion_invalid_uuid_validation(
  connection: api.IConnection,
) {
  /**
   * Validate rule deletion rejects invalid targets while preserving type
   * safety.
   *
   * Scenario rewrite rationale:
   *
   * - Original goal was to test malformed UUIDs in path params. However, the SDK
   *   types require string & tags.Format<"uuid">, and creating malformed values
   *   would violate compile-time type safety (forbidden). Therefore, we
   *   validate error handling with valid-formatted but non-existent UUIDs
   *   instead.
   *
   * Steps:
   *
   * 1. Join as a communityMember (obtain authorization via SDK-managed token).
   * 2. Attempt to delete a rule using random UUIDs for both communityId and
   *    ruleId. Expect an error without asserting specific status codes.
   */

  // 1) Authenticate as communityMember
  const joinBody = {
    username: `member_${RandomGenerator.alphaNumeric(10)}`,
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12), // MinLength<8>
  } satisfies ICommunityPlatformCommunityMember.ICreate;

  const authorized: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(connection, {
      body: joinBody,
    });
  typia.assert(authorized);

  // 2) Attempt deletion with valid-formatted but non-existent UUIDs
  const nonExistingCommunityId = typia.random<string & tags.Format<"uuid">>();
  const nonExistingRuleId = typia.random<string & tags.Format<"uuid">>();

  await TestValidator.error(
    "erase should fail for non-existent community/rule IDs",
    async () => {
      await api.functional.communityPlatform.communityMember.communities.rules.erase(
        connection,
        {
          communityId: nonExistingCommunityId,
          ruleId: nonExistingRuleId,
        },
      );
    },
  );
}
