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

export async function test_api_community_membership_leave_success_and_membercount_update(
  connection: api.IConnection,
) {
  // 1) Register a new member and authenticate (session handled by SDK)
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    username: `user_${RandomGenerator.alphaNumeric(12)}`,
    password: `pw_${RandomGenerator.alphaNumeric(16)}`,
  } satisfies ICommunityPlatformRegisteredMember.IJoin;
  const authorized: ICommunityPlatformRegisteredMember.IAuthorized =
    await api.functional.auth.registeredMember.join(connection, {
      body: joinBody,
    });
  typia.assert(authorized);

  // 2) Create a community with a valid, unique name and allowed category
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
  ] as const satisfies Readonly<IECommunityCategory[]>;
  const communityName: string = `${RandomGenerator.alphabets(1)}${RandomGenerator.alphaNumeric(10)}${RandomGenerator.alphabets(1)}`;
  const createBody = {
    name: communityName,
    category: RandomGenerator.pick(categories),
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community: ICommunityPlatformCommunity =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      { body: createBody },
    );
  typia.assert(community);

  // 3) Join the community via PUT membership.update({ join: true })
  const afterJoin: ICommunityPlatformCommunityMember =
    await api.functional.communityPlatform.registeredMember.communities.membership.update(
      connection,
      {
        communityName,
        body: {
          join: true,
        } satisfies ICommunityPlatformCommunityMember.IUpdate,
      },
    );
  typia.assert(afterJoin);
  // Validate joined state and target community name
  const afterJoinCommunityName: string = afterJoin.community
    .name satisfies string as string;
  TestValidator.equals(
    "joined state after join should be true",
    afterJoin.joined,
    true,
  );
  TestValidator.equals(
    "membership relates to the created community",
    afterJoinCommunityName,
    communityName,
  );
  const countAfterJoin: number =
    afterJoin.memberCount satisfies number as number;

  // 4) Leave the community via DELETE (erase)
  await api.functional.communityPlatform.registeredMember.communities.membership.erase(
    connection,
    {
      communityName,
    },
  );

  // 5) Re-fetch membership snapshot by ensuring left (idempotent join=false)
  const afterLeave: ICommunityPlatformCommunityMember =
    await api.functional.communityPlatform.registeredMember.communities.membership.update(
      connection,
      {
        communityName,
        body: {
          join: false,
        } satisfies ICommunityPlatformCommunityMember.IUpdate,
      },
    );
  typia.assert(afterLeave);
  const countAfterLeave: number =
    afterLeave.memberCount satisfies number as number;
  TestValidator.equals(
    "memberCount should decrement by 1 after leaving",
    countAfterLeave,
    countAfterJoin - 1,
  );
  TestValidator.equals(
    "joined state after leave should be false",
    afterLeave.joined,
    false,
  );

  // 6) Verify DELETE idempotence: second erase succeeds and state remains unchanged
  await api.functional.communityPlatform.registeredMember.communities.membership.erase(
    connection,
    {
      communityName,
    },
  );

  const afterSecondLeave: ICommunityPlatformCommunityMember =
    await api.functional.communityPlatform.registeredMember.communities.membership.update(
      connection,
      {
        communityName,
        body: {
          join: false,
        } satisfies ICommunityPlatformCommunityMember.IUpdate,
      },
    );
  typia.assert(afterSecondLeave);
  const countAfterSecondLeave: number =
    afterSecondLeave.memberCount satisfies number as number;
  TestValidator.equals(
    "second DELETE is idempotent: memberCount unchanged",
    countAfterSecondLeave,
    countAfterLeave,
  );
  TestValidator.equals(
    "second DELETE is idempotent: joined remains false",
    afterSecondLeave.joined,
    false,
  );
}
