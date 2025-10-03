import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IClientContext } from "@ORGANIZATION/PROJECT-api/lib/structures/IClientContext";
import type { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformCommunityRule } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityRule";
import type { ICommunityPlatformCommunityRuleArray } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityRuleArray";
import type { ICommunityPlatformRegisteredMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRegisteredMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";
import type { IECommunityCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityCategory";
import type { IECommunityPlatformCommunityCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformCommunityCategory";

/**
 * Verify membership join/leave toggling is idempotent and updates memberCount
 * correctly.
 *
 * Business flow
 *
 * 1. Register a new member (auth.join) to obtain authenticated context.
 * 2. Create a community with a unique, policy-compliant name.
 * 3. Normalize baseline by forcing leave (join:false) so current state is not
 *    joined.
 * 4. Join once and validate memberCount increments by exactly 1.
 * 5. Join again and validate idempotency (memberCount unchanged; still joined).
 * 6. Leave once and validate memberCount decrements by exactly 1.
 * 7. Leave again and validate idempotency (memberCount unchanged; still left).
 *
 * Notes
 *
 * - Response ICommunityPlatformCommunityMember provides joined, memberCount, and
 *   community IBasic.name.
 * - No HTTP status code/message checks; focus on business logic and type safety.
 */
export async function test_api_membership_toggle_join_leave_idempotent(
  connection: api.IConnection,
) {
  // 1) Register a new member (authenticated context is set by SDK)
  const email = typia.random<string & tags.Format<"email">>();
  const username = `user_${RandomGenerator.alphaNumeric(10)}`;
  const password = `Pw_${RandomGenerator.alphaNumeric(12)}`;

  const auth = await api.functional.auth.registeredMember.join(connection, {
    body: {
      email,
      username,
      password,
      // Optional fields intentionally omitted; SDK sets Authorization header
    } satisfies ICommunityPlatformRegisteredMember.IJoin,
  });
  typia.assert(auth);

  // 2) Create a community with a unique, compliant name
  const communityName = `t${RandomGenerator.alphaNumeric(6)}_${RandomGenerator.alphaNumeric(5)}`; // starts/ends alphanumeric, length 13
  const community =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      {
        body: {
          name: communityName,
          category: "Science",
          description: RandomGenerator.paragraph({
            sentences: 8,
            wordMin: 3,
            wordMax: 8,
          }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);
  TestValidator.equals(
    "created community name must match request name",
    community.name,
    communityName,
  );

  // 3) Normalize baseline: force leave to ensure a known starting state
  const ensureLeft =
    await api.functional.communityPlatform.registeredMember.communities.membership.update(
      connection,
      {
        communityName,
        body: {
          join: false,
        } satisfies ICommunityPlatformCommunityMember.IUpdate,
      },
    );
  typia.assert(ensureLeft);
  TestValidator.equals(
    "baseline ensureLeft.joined should be false",
    ensureLeft.joined,
    false,
  );
  TestValidator.equals(
    "ensureLeft.community.name should equal target communityName",
    ensureLeft.community.name,
    communityName,
  );
  const m0 = ensureLeft.memberCount;

  // 4) Join: expect increment by 1
  const joined1 =
    await api.functional.communityPlatform.registeredMember.communities.membership.update(
      connection,
      {
        communityName,
        body: {
          join: true,
        } satisfies ICommunityPlatformCommunityMember.IUpdate,
      },
    );
  typia.assert(joined1);
  TestValidator.equals("joined1.joined should be true", joined1.joined, true);
  TestValidator.equals(
    "joined1.memberCount should equal m0 + 1",
    joined1.memberCount,
    m0 + 1,
  );
  TestValidator.equals(
    "joined1.community.name remains consistent",
    joined1.community.name,
    communityName,
  );
  const m1 = joined1.memberCount;

  // 5) Join again: idempotent (no double counting)
  const joined2 =
    await api.functional.communityPlatform.registeredMember.communities.membership.update(
      connection,
      {
        communityName,
        body: {
          join: true,
        } satisfies ICommunityPlatformCommunityMember.IUpdate,
      },
    );
  typia.assert(joined2);
  TestValidator.equals("joined2.joined should be true", joined2.joined, true);
  TestValidator.equals(
    "joined2.memberCount should remain equal to m1 (idempotent)",
    joined2.memberCount,
    m1,
  );

  // 6) Leave: expect decrement by 1 from m1
  const left1 =
    await api.functional.communityPlatform.registeredMember.communities.membership.update(
      connection,
      {
        communityName,
        body: {
          join: false,
        } satisfies ICommunityPlatformCommunityMember.IUpdate,
      },
    );
  typia.assert(left1);
  TestValidator.equals("left1.joined should be false", left1.joined, false);
  TestValidator.equals(
    "left1.memberCount should equal m1 - 1",
    left1.memberCount,
    m1 - 1,
  );
  const m3 = left1.memberCount;

  // 7) Leave again: idempotent (no further decrement)
  const left2 =
    await api.functional.communityPlatform.registeredMember.communities.membership.update(
      connection,
      {
        communityName,
        body: {
          join: false,
        } satisfies ICommunityPlatformCommunityMember.IUpdate,
      },
    );
  typia.assert(left2);
  TestValidator.equals("left2.joined should be false", left2.joined, false);
  TestValidator.equals(
    "left2.memberCount should remain equal to left1 (idempotent)",
    left2.memberCount,
    m3,
  );
}
