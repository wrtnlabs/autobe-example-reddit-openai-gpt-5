import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

/**
 * Reject community creation when using a non-existent category id.
 *
 * Steps
 *
 * 1. Join as a community member to obtain an authenticated session
 * 2. Generate a random UUID for community_platform_category_id that does not exist
 * 3. Attempt to create a community with a valid name but the random category id
 * 4. Expect the operation to throw (validation/not-found), ensuring no creation
 *    occurs
 */
export async function test_api_community_creation_invalid_category(
  connection: api.IConnection,
) {
  // 1) Authenticate as community member
  const joinBody = {
    username: `user_${RandomGenerator.alphaNumeric(10)}`,
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformCommunityMember.ICreate;

  const authorized = await api.functional.auth.communityMember.join(
    connection,
    {
      body: joinBody,
    },
  );
  typia.assert(authorized);

  // 2) Prepare non-existent category id and valid community name
  const invalidCategoryId = typia.random<string & tags.Format<"uuid">>();
  const communityName = `${RandomGenerator.alphabets(1)}${RandomGenerator.alphaNumeric(6)}${RandomGenerator.alphabets(1)}`;

  const createBody = {
    name: communityName,
    community_platform_category_id: invalidCategoryId,
  } satisfies ICommunityPlatformCommunity.ICreate;

  // 3) Attempt create and 4) expect error
  await TestValidator.error(
    "reject community creation with non-existent category id",
    async () => {
      await api.functional.communityPlatform.communityMember.communities.create(
        connection,
        { body: createBody },
      );
    },
  );
}
