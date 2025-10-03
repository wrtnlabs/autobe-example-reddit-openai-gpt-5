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
import type { ICommunityPlatformRecentCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRecentCommunity";
import type { ICommunityPlatformRegisteredMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRegisteredMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";
import type { IECommunityCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityCategory";
import type { IECommunityPlatformCommunityCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformCommunityCategory";

/**
 * Recent communities reflect the last five community interactions
 * (visits/joins) for the authenticated member, ordered by lastActivityAt
 * descending.
 *
 * Steps:
 *
 * 1. Join as a new registered member (User A), which authenticates the session.
 * 2. Create six distinct communities (valid names & categories).
 * 3. Produce activity signals in deterministic order:
 *
 *    - Visit C1, Join C2, Visit C3, Join C4, Visit C5, Visit C6 (last)
 * 4. Fetch /me/recentCommunities and validate:
 *
 *    - Exactly five items are returned (cap at 5)
 *    - Ordering is [C6, C5, C4, C3, C2]
 *    - LastActivityAt is non-increasing (monotonic) across items
 *    - All items belong to the created communities; C1 excluded
 */
export async function test_api_recent_communities_list_after_visit_and_join_ordered_limit_5(
  connection: api.IConnection,
) {
  // 1) Authenticate as a registered member (User A)
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const username: string = `user_${RandomGenerator.alphaNumeric(12)}`;
  const password: string = `P${RandomGenerator.alphaNumeric(11)}!`;

  const auth = await api.functional.auth.registeredMember.join(connection, {
    body: {
      email,
      username,
      password,
      displayName: RandomGenerator.name(),
    } satisfies ICommunityPlatformRegisteredMember.IJoin,
  });
  typia.assert(auth);

  // 2) Create six distinct communities with valid names and categories
  type CommunityName = string &
    tags.MinLength<3> &
    tags.MaxLength<30> &
    tags.Pattern<"^[A-Za-z0-9](?:[A-Za-z0-9_-]{1,28}[A-Za-z0-9])?$">;

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

  const names: CommunityName[] = ArrayUtil.repeat(6, () =>
    typia.random<CommunityName>(),
  );

  const createdCommunities: ICommunityPlatformCommunity[] =
    await ArrayUtil.asyncMap(names, async (communityName) => {
      const created =
        await api.functional.communityPlatform.registeredMember.communities.create(
          connection,
          {
            body: {
              name: communityName,
              category: RandomGenerator.pick(categories),
              description: RandomGenerator.paragraph({ sentences: 8 }),
            } satisfies ICommunityPlatformCommunity.ICreate,
          },
        );
      typia.assert(created);
      return created;
    });
  void createdCommunities; // created content not strictly used later, but validates creation flow

  // 3) Activity sequence to define recency order
  // Visit C1
  const visit1 = await api.functional.communityPlatform.communities.at(
    connection,
    { communityName: names[0] },
  );
  typia.assert(visit1);

  // Join C2
  const join2 =
    await api.functional.communityPlatform.registeredMember.communities.membership.update(
      connection,
      {
        communityName: names[1],
        body: {
          join: true,
        } satisfies ICommunityPlatformCommunityMember.IUpdate,
      },
    );
  typia.assert(join2);

  // Visit C3
  const visit3 = await api.functional.communityPlatform.communities.at(
    connection,
    { communityName: names[2] },
  );
  typia.assert(visit3);

  // Join C4
  const join4 =
    await api.functional.communityPlatform.registeredMember.communities.membership.update(
      connection,
      {
        communityName: names[3],
        body: {
          join: true,
        } satisfies ICommunityPlatformCommunityMember.IUpdate,
      },
    );
  typia.assert(join4);

  // Visit C5
  const visit5 = await api.functional.communityPlatform.communities.at(
    connection,
    { communityName: names[4] },
  );
  typia.assert(visit5);

  // Visit C6 (last)
  const visit6 = await api.functional.communityPlatform.communities.at(
    connection,
    { communityName: names[5] },
  );
  typia.assert(visit6);

  // 4) Read recent communities
  const recents =
    await api.functional.communityPlatform.registeredMember.me.recentCommunities.index(
      connection,
    );
  typia.assert(recents);

  // 5) Validations
  // Cap at five
  TestValidator.equals(
    "recent list length is exactly 5 after 6 activities",
    recents.data.length,
    5,
  );

  // Expected ordering by performed actions (most recent first): C6, C5, C4, C3, C2
  const expectedOrder = [names[5], names[4], names[3], names[2], names[1]];
  TestValidator.equals(
    "recent communities ordered by lastActivityAt desc per actions",
    recents.data.map((it) => it.name),
    expectedOrder,
  );

  // Monotonic non-increasing lastActivityAt across items
  for (let i = 0; i + 1 < recents.data.length; i++) {
    const a = recents.data[i]!.lastActivityAt;
    const b = recents.data[i + 1]!.lastActivityAt;
    TestValidator.predicate(
      `lastActivityAt[${i}] >= lastActivityAt[${i + 1}]`,
      a >= b,
    );
  }

  // Ensure oldest (C1) is excluded and every item belongs to created set
  const createdNameSet = new Set<CommunityName>(names);
  TestValidator.predicate(
    "oldest community (C1) is excluded from the recents list",
    recents.data.every((it) => it.name !== names[0]),
  );
  TestValidator.predicate(
    "all recent items are part of setup-created communities",
    recents.data.every((it) => createdNameSet.has(it.name as CommunityName)),
  );
}
