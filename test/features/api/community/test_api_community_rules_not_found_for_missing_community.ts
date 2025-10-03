import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ICommunityPlatformCommunityRule } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityRule";
import type { IECommunityPlatformCommunityRuleSortBy } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformCommunityRuleSortBy";
import type { IESortOrder } from "@ORGANIZATION/PROJECT-api/lib/structures/IESortOrder";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformCommunityRule } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformCommunityRule";

/**
 * Validate not-found behavior when listing rules for a non-existent community.
 *
 * Purpose:
 *
 * - Ensure that the rules listing endpoint rejects requests for communities that
 *   do not exist while the provided communityName still satisfies the required
 *   naming constraints.
 *
 * Steps:
 *
 * 1. Generate a syntactically valid, random community name that is extremely
 *    unlikely to exist (prefix "missing_" + random alphanumeric).
 * 2. Prepare a minimal, valid request body (e.g., limit and default ordering).
 * 3. Attempt to list rules with the non-existent community name and expect an
 *    error. Do not assert a specific HTTP status code; only verify that it
 *    fails as per business rule.
 */
export async function test_api_community_rules_not_found_for_missing_community(
  connection: api.IConnection,
) {
  // 1) Generate a valid but non-existent community name, conforming to regex
  const missingCommunityName = typia.assert<
    string &
      tags.MinLength<3> &
      tags.MaxLength<30> &
      tags.Pattern<"^[A-Za-z0-9](?:[A-Za-z0-9_-]{1,28}[A-Za-z0-9])?$">
  >(`missing_${RandomGenerator.alphaNumeric(12)}`);

  // 2) Minimal valid request body for listing rules
  const requestBody = {
    limit: 5,
    sortBy: "order",
    order: "asc",
  } satisfies ICommunityPlatformCommunityRule.IRequest;

  // 3) Expect error when listing rules for a non-existent community
  await TestValidator.error(
    "listing rules for non-existent community should fail",
    async () => {
      await api.functional.communityPlatform.communities.rules.index(
        connection,
        {
          communityName: missingCommunityName,
          body: requestBody,
        },
      );
    },
  );
}
