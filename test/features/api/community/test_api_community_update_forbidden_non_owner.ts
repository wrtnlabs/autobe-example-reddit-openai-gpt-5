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
 * Verify non-owner cannot update a community.
 *
 * Business flow:
 *
 * 1. User A joins (becomes authenticated) and creates a community.
 * 2. User B joins to switch authentication context.
 * 3. User B attempts to update User A's community and must be rejected.
 *
 * Notes:
 *
 * - We only assert that an error occurs on the non-owner update attempt (no
 *   specific HTTP status or message assertions per policy).
 * - No GET endpoint is provided to re-fetch the community, so we validate
 *   ownership via the failure of User B's update call.
 */
export async function test_api_community_update_forbidden_non_owner(
  connection: api.IConnection,
) {
  // 1) Join as User A (owner)
  const joinBodyA = {
    email: typia.random<string & tags.Format<"email">>(),
    username: `owner_${RandomGenerator.alphaNumeric(8)}`,
    password: RandomGenerator.alphaNumeric(12),
    displayName: RandomGenerator.name(2),
    client: {
      userAgent: "e2e-community-tests",
      sessionType: "standard",
    } satisfies IClientContext,
  } satisfies ICommunityPlatformRegisteredMember.IJoin;
  const authA = await api.functional.auth.registeredMember.join(connection, {
    body: joinBodyA,
  });
  typia.assert(authA);

  // 1-1) Create a community owned by User A
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
  const createBody = {
    name: `e2e_${RandomGenerator.alphaNumeric(12)}`,
    category: RandomGenerator.pick(categories),
    description: RandomGenerator.paragraph({ sentences: 8 }),
  } satisfies ICommunityPlatformCommunity.ICreate;
  const created =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      { body: createBody },
    );
  typia.assert(created);
  TestValidator.equals(
    "created community name matches input name",
    created.name,
    createBody.name,
  );

  // 2) Join as User B (non-owner) to switch auth context
  const joinBodyB = {
    email: typia.random<string & tags.Format<"email">>(),
    username: `other_${RandomGenerator.alphaNumeric(8)}`,
    password: RandomGenerator.alphaNumeric(12),
    displayName: RandomGenerator.name(2),
    client: {
      userAgent: "e2e-community-tests",
      sessionType: "standard",
    } satisfies IClientContext,
  } satisfies ICommunityPlatformRegisteredMember.IJoin;
  const authB = await api.functional.auth.registeredMember.join(connection, {
    body: joinBodyB,
  });
  typia.assert(authB);

  // 3) User B attempts to update User A's community → should be forbidden
  const updateBodyByB = {
    description: RandomGenerator.paragraph({ sentences: 10 }),
    category: RandomGenerator.pick(categories),
  } satisfies ICommunityPlatformCommunity.IUpdate;
  await TestValidator.error(
    "non-owner must not be able to update the community",
    async () => {
      await api.functional.communityPlatform.registeredMember.communities.update(
        connection,
        {
          communityName: typia.assert<
            string &
              tags.MinLength<3> &
              tags.MaxLength<30> &
              tags.Pattern<"^[A-Za-z0-9](?:[A-Za-z0-9_-]{1,28}[A-Za-z0-9])?$">
          >(created.name),
          body: updateBodyByB,
        },
      );
    },
  );
}
