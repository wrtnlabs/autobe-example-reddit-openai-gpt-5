import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ICommunityPlatformCommunityRule } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityRule";
import type { IECommunityPlatformCommunityRuleOrderBy } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformCommunityRuleOrderBy";
import type { IESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IESortDirection";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformCommunityRule } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformCommunityRule";

/**
 * Listing rules for a non-existent community should fail.
 *
 * Business context:
 *
 * - Community rules are children of a community. The index endpoint lists rules
 *   for a given parent communityId. If the community does not exist, the call
 *   must fail.
 *
 * Test steps:
 *
 * 1. Generate a random UUID to use as a non-existent communityId.
 * 2. Call the listing endpoint with a minimal, valid request body.
 * 3. Assert that the call results in an error. Do not assert a specific status
 *    code.
 */
export async function test_api_community_rules_listing_community_not_found(
  connection: api.IConnection,
) {
  // 1) Prepare a non-existent community ID
  const missingCommunityId = typia.random<string & tags.Format<"uuid">>();

  // 2) Minimal, valid request body relying on server defaults
  const requestBody = {
    // Intentionally empty; all fields are optional and defaulted by server
  } satisfies ICommunityPlatformCommunityRule.IRequest;

  // 3) Expect error for non-existent community
  await TestValidator.error(
    "listing rules for a non-existent community should error",
    async () => {
      await api.functional.communityPlatform.communities.rules.index(
        connection,
        {
          communityId: missingCommunityId,
          body: requestBody,
        },
      );
    },
  );
}
