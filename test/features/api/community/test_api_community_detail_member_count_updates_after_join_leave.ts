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

export async function test_api_community_detail_member_count_updates_after_join_leave(
  connection: api.IConnection,
) {
  // Purpose: Ensure public community detail memberCount reflects User B's join and leave actions.
  // Strategy: Use three isolated connections - userAConn (creator), userBConn (join/leave actor), and publicConn (unauthenticated reads).

  // 0) Prepare isolated connections for distinct auth contexts and public reads
  const userAConn: api.IConnection = { ...connection, headers: {} };
  const userBConn: api.IConnection = { ...connection, headers: {} };
  const publicConn: api.IConnection = { ...connection, headers: {} };

  // 1) User A joins (registers) to obtain an authenticated session
  const userAAuth = await api.functional.auth.registeredMember.join(userAConn, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      username: `userA_${RandomGenerator.alphaNumeric(10)}`,
      password: "P@ssw0rd!",
      displayName: RandomGenerator.name(),
      client: {
        userAgent: "e2e-test-agent",
        clientPlatform: "node-e2e",
        sessionType: "standard",
      },
    } satisfies ICommunityPlatformRegisteredMember.IJoin,
  });
  typia.assert(userAAuth);
  // SDK has applied Authorization header into userAConn

  // 2) Create a community as User A
  const communityName = `e2e_${RandomGenerator.alphaNumeric(12)}`; // matches ^[A-Za-z0-9](?:[A-Za-z0-9_-]{1,28}[A-Za-z0-9])?$ and 3-30 length
  const createdCommunity =
    await api.functional.communityPlatform.registeredMember.communities.create(
      userAConn,
      {
        body: {
          name: communityName,
          category: "Science",
          description: RandomGenerator.paragraph({ sentences: 6 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(createdCommunity);

  // 3) Publicly read community detail before User B joins
  const before = await api.functional.communityPlatform.communities.at(
    publicConn,
    {
      communityName,
    },
  );
  typia.assert(before);
  const memberCountBefore: number = before.memberCount ?? 0;

  // 4) User B joins (registers) and then joins the community
  const userBAuth = await api.functional.auth.registeredMember.join(userBConn, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      username: `userB_${RandomGenerator.alphaNumeric(10)}`,
      password: "P@ssw0rd!",
      displayName: RandomGenerator.name(),
      client: {
        userAgent: "e2e-test-agent",
        clientPlatform: "node-e2e",
        sessionType: "standard",
      },
    } satisfies ICommunityPlatformRegisteredMember.IJoin,
  });
  typia.assert(userBAuth);
  // SDK has applied Authorization header into userBConn

  const afterJoinMembership =
    await api.functional.communityPlatform.registeredMember.communities.membership.update(
      userBConn,
      {
        communityName,
        body: {
          join: true,
        } satisfies ICommunityPlatformCommunityMember.IUpdate,
      },
    );
  typia.assert(afterJoinMembership);
  TestValidator.equals(
    "membership.joined should be true after joining",
    afterJoinMembership.joined,
    true,
  );

  // Publicly read again to confirm memberCount increased after join (monotonic)
  const afterJoin = await api.functional.communityPlatform.communities.at(
    publicConn,
    {
      communityName,
    },
  );
  typia.assert(afterJoin);
  const memberCountAfterJoin: number = afterJoin.memberCount ?? 0;
  TestValidator.predicate(
    "memberCount increased after join (monotonic)",
    memberCountAfterJoin > memberCountBefore,
  );

  // Optional cross-check: membership response count should match public detail
  TestValidator.equals(
    "membership response memberCount matches public detail after join",
    afterJoinMembership.memberCount,
    memberCountAfterJoin,
  );

  // 5) User B leaves the community
  await api.functional.communityPlatform.registeredMember.communities.membership.erase(
    userBConn,
    { communityName },
  );

  // 6) Publicly read again to ensure memberCount decreased by exactly 1
  const afterLeave = await api.functional.communityPlatform.communities.at(
    publicConn,
    {
      communityName,
    },
  );
  typia.assert(afterLeave);
  const memberCountAfterLeave: number = afterLeave.memberCount ?? 0;
  TestValidator.equals(
    "memberCount decreased exactly by 1 after leaving",
    memberCountAfterLeave,
    memberCountAfterJoin - 1,
  );
}
