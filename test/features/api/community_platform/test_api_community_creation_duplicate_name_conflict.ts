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
 * Enforce unique immutable community names on creation.
 *
 * Steps
 *
 * 1. Register a new member (join) and obtain an authenticated session
 * 2. Create a community with a valid, unique name
 * 3. Attempt to create another community using the same name (case-insensitive)
 *    and expect the operation to fail
 *
 * Validations
 *
 * - First creation succeeds and echoes the requested name
 * - Second creation throws an error (conflict); per policy, do not assert
 *   status/message
 */
export async function test_api_community_creation_duplicate_name_conflict(
  connection: api.IConnection,
) {
  // 1) Register a new member (authenticated context)
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    username: `user_${RandomGenerator.alphaNumeric(10)}`,
    password: RandomGenerator.alphaNumeric(16),
    displayName: RandomGenerator.name(),
    client: {
      userAgent: "e2e/community-creation",
      sessionType: "standard",
    },
  } satisfies ICommunityPlatformRegisteredMember.IJoin;
  const auth: ICommunityPlatformRegisteredMember.IAuthorized =
    await api.functional.auth.registeredMember.join(connection, {
      body: joinBody,
    });
  typia.assert(auth);

  // 2) Prepare a valid community creation payload
  const categories = [
    "Tech & Programming",
    "Science",
    "Movies & TV",
    "Games",
    "Sports",
    "Lifestyle & Wellness",
    "Study & Education",
    "Art & Design",
    "Business & Finance",
    "News & Current Affairs",
  ] as const;
  const category = RandomGenerator.pick(categories);

  // Name: start with letter, then strictly alphanumeric to avoid pattern edge cases
  const communityName = `c${RandomGenerator.alphaNumeric(11)}`; // total length 12 (within 3–30)

  const createBody = {
    name: communityName,
    category,
    description: RandomGenerator.paragraph({ sentences: 12 }), // << 500 chars
  } satisfies ICommunityPlatformCommunity.ICreate;

  const created: ICommunityPlatformCommunity =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      { body: createBody },
    );
  typia.assert(created);

  // verify echo fields
  TestValidator.equals(
    "created community name should equal requested name",
    created.name,
    createBody.name,
  );

  // 3) Attempt duplicate create with case-variant of the same name
  const duplicateBody = {
    ...createBody,
    name: createBody.name.toUpperCase(),
  } satisfies ICommunityPlatformCommunity.ICreate;

  await TestValidator.error(
    "duplicate community name must be rejected",
    async () => {
      await api.functional.communityPlatform.registeredMember.communities.create(
        connection,
        { body: duplicateBody },
      );
    },
  );
}
