import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IClientContext } from "@ORGANIZATION/PROJECT-api/lib/structures/IClientContext";
import type { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";
import type { ICommunityPlatformCommunityRule } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityRule";
import type { ICommunityPlatformCommunityRuleArray } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityRuleArray";
import type { ICommunityPlatformRegisteredMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRegisteredMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";
import type { IECommunityCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityCategory";
import type { IECommunityPlatformCommunityCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformCommunityCategory";
import type { IECommunityPlatformCommunityRuleSortBy } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformCommunityRuleSortBy";
import type { IESortOrder } from "@ORGANIZATION/PROJECT-api/lib/structures/IESortOrder";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformCommunityRule } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformCommunityRule";

export async function test_api_community_rules_empty_state(
  connection: api.IConnection,
) {
  /**
   * Validate empty-state listing of community rules.
   *
   * Steps:
   *
   * 1. Register a member (join) to obtain an authenticated session
   * 2. Create a community with a valid, unique name and a valid category; do not
   *    provide initial rules
   * 3. List rules for the created community
   * 4. Assert empty list and zero-record pagination
   */

  // 1) Register a member (authorized session for creation)
  const authorized = await api.functional.auth.registeredMember.join(
    connection,
    {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        username: RandomGenerator.name(1),
        password: RandomGenerator.alphaNumeric(12),
        displayName: RandomGenerator.name(1),
      } satisfies ICommunityPlatformRegisteredMember.IJoin,
    },
  );
  typia.assert(authorized);

  // 2) Create a community with a valid name and category; no initial rules
  const communityName: string = `c${RandomGenerator.alphaNumeric(9)}`; // length 10, alphanumeric start/end
  const community =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      {
        body: {
          name: communityName,
          category: "Science",
          description: RandomGenerator.paragraph({ sentences: 8 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);

  // 3) List rules for this community (no filters, default pagination)
  const page = await api.functional.communityPlatform.communities.rules.index(
    connection,
    {
      communityName: community.name,
      body: {} satisfies ICommunityPlatformCommunityRule.IRequest,
    },
  );
  typia.assert(page);

  // 4) Business validations: empty data and zero-record pagination
  TestValidator.equals(
    "newly created community should have no rules",
    page.data.length,
    0,
  );
  TestValidator.equals(
    "pagination records should be zero for empty rules",
    page.pagination.records,
    0,
  );
  TestValidator.equals(
    "pagination pages should be zero for empty rules",
    page.pagination.pages,
    0,
  );
}
