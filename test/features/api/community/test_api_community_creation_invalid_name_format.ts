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

/**
 * Validate rejection of invalid community name formats.
 *
 * Business goal:
 *
 * - Creation must fail when the requested community name violates the format
 *   rules.
 *
 * Steps:
 *
 * 1. Register a new member (join) to obtain an authenticated session.
 * 2. Attempt to create communities using several invalid name patterns:
 *
 *    - Contains spaces
 *    - Leading hyphen/underscore
 *    - Trailing hyphen/underscore
 *    - Disallowed special character (e.g., '!')
 * 3. For each invalid name, assert that the API call throws an error.
 *
 * Notes:
 *
 * - Per E2E policy, do not assert HTTP status codes or error messages; only the
 *   occurrence of an error is validated.
 */
export async function test_api_community_creation_invalid_name_format(
  connection: api.IConnection,
) {
  // 1) Authenticate as a registered member
  const authorized: ICommunityPlatformRegisteredMember.IAuthorized =
    await api.functional.auth.registeredMember.join(connection, {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        username: RandomGenerator.alphabets(8),
        password: RandomGenerator.alphaNumeric(12),
        // displayName is optional; omit to keep payload minimal
      } satisfies ICommunityPlatformRegisteredMember.IJoin,
    });
  typia.assert(authorized);

  // Select a valid category from IECommunityCategory
  const category: IECommunityCategory = "Science";

  // Helper to attempt creation with a given name
  const attemptCreate = async (name: string) =>
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      {
        body: {
          name,
          category,
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );

  // 2) Invalid name patterns → should error
  await TestValidator.error("rejects name containing spaces", async () => {
    await attemptCreate("my community");
  });

  await TestValidator.error("rejects name starting with hyphen", async () => {
    await attemptCreate("-start");
  });

  await TestValidator.error(
    "rejects name starting with underscore",
    async () => {
      await attemptCreate("_start");
    },
  );

  await TestValidator.error("rejects name ending with hyphen", async () => {
    await attemptCreate("end-");
  });

  await TestValidator.error("rejects name ending with underscore", async () => {
    await attemptCreate("end_");
  });

  await TestValidator.error(
    "rejects name with disallowed special character",
    async () => {
      await attemptCreate("bad!chars");
    },
  );
}
