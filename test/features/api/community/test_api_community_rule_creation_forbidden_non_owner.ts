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
 * Ensure non-owners cannot create rules in a community they do not own.
 *
 * Flow:
 *
 * 1. Join as User A (owner) and create a community with a valid, unique name.
 * 2. Join as User B to switch identity and simulate a non-owner.
 * 3. Using User B's session, attempt to create a rule under User A's community.
 * 4. Expect an authorization error (non-owner forbidden); do not assert specific
 *    status code.
 *
 * Notes:
 *
 * - SDK join() mutates Authorization token in the shared connection; calling join
 *   again switches identity.
 * - Available SDK does not expose a rules read or community detail GET; focus on
 *   the error outcome only.
 */
export async function test_api_community_rule_creation_forbidden_non_owner(
  connection: api.IConnection,
) {
  // 1) Join as User A (owner)
  const userA = await api.functional.auth.registeredMember.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      username: RandomGenerator.alphabets(10),
      password: RandomGenerator.alphaNumeric(12),
      displayName: RandomGenerator.name(),
    } satisfies ICommunityPlatformRegisteredMember.IJoin,
  });
  typia.assert(userA);

  // 2) Create a community as User A with a valid name and category
  const communityName = typia.random<
    string &
      tags.MinLength<3> &
      tags.MaxLength<30> &
      tags.Pattern<"^[A-Za-z0-9](?:[A-Za-z0-9_-]{1,28}[A-Za-z0-9])?$">
  >();
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
  ] as const satisfies readonly IECommunityCategory[];
  const category: IECommunityCategory = RandomGenerator.pick(categories);

  const createdCommunity =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      {
        body: {
          name: communityName,
          category,
          description: undefined,
          logoUri: undefined,
          bannerUri: undefined,
          rules: undefined,
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(createdCommunity);
  TestValidator.equals(
    "created community name should match input",
    createdCommunity.name,
    communityName,
  );

  // 3) Switch to User B (non-owner)
  const userB = await api.functional.auth.registeredMember.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      username: RandomGenerator.alphabets(10),
      password: RandomGenerator.alphaNumeric(12),
      displayName: RandomGenerator.name(),
    } satisfies ICommunityPlatformRegisteredMember.IJoin,
  });
  typia.assert(userB);

  // 4) Attempt to create a rule as non-owner and expect an error (no specific status asserted)
  await TestValidator.error(
    "non-owner should not be able to create a community rule",
    async () => {
      await api.functional.communityPlatform.registeredMember.communities.rules.create(
        connection,
        {
          communityName,
          body: {
            order: 1,
            text: "Be respectful",
          } satisfies ICommunityPlatformCommunityRule.ICreate,
        },
      );
    },
  );
}
