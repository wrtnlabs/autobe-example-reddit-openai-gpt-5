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
 * Verify user memberships listing reflects join and leave operations.
 *
 * Steps:
 *
 * 1. Register a new member (User A) and authenticate.
 * 2. Create two distinct communities with valid names and categories.
 * 3. Join both communities using membership.update (join=true).
 * 4. List memberships for the user and verify both communities appear with no
 *    duplicates.
 * 5. Leave one community (join=false) and verify it disappears from the list while
 *    the other remains.
 * 6. Repeat leave on the same community to confirm idempotency; list remains
 *    unchanged for presence.
 */
export async function test_api_user_memberships_list_after_join_and_leave(
  connection: api.IConnection,
) {
  // 1) Register a new member (User A)
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const suffix: string = RandomGenerator.alphaNumeric(12);
  const username: string = `user_${suffix}`;
  const password: string = `P@ss_${RandomGenerator.alphaNumeric(10)}`;

  const authorized: ICommunityPlatformRegisteredMember.IAuthorized =
    await api.functional.auth.registeredMember.join(connection, {
      body: {
        email,
        username,
        password,
        displayName: RandomGenerator.name(),
      } satisfies ICommunityPlatformRegisteredMember.IJoin,
    });
  typia.assert(authorized);

  // 2) Create two communities with valid names and categories
  const alphaNameRaw: string = `alpha_${suffix}`;
  const betaNameRaw: string = `beta_${suffix}`;
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
  const category: (typeof categories)[number] =
    RandomGenerator.pick(categories);

  const alpha =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      {
        body: {
          name: typia.assert<
            string &
              tags.MinLength<3> &
              tags.MaxLength<30> &
              tags.Pattern<"^[A-Za-z0-9](?:[A-Za-z0-9_-]{1,28}[A-Za-z0-9])?$">
          >(alphaNameRaw),
          category,
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(alpha);

  const beta =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      {
        body: {
          name: typia.assert<
            string &
              tags.MinLength<3> &
              tags.MaxLength<30> &
              tags.Pattern<"^[A-Za-z0-9](?:[A-Za-z0-9_-]{1,28}[A-Za-z0-9])?$">
          >(betaNameRaw),
          category: RandomGenerator.pick(categories),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(beta);

  const alphaName: string = alpha.name;
  const betaName: string = beta.name;
  TestValidator.equals("alpha community name echoed", alphaName, alphaNameRaw);
  TestValidator.equals("beta community name echoed", betaName, betaNameRaw);

  // 3) Join both communities
  const joinedAlpha =
    await api.functional.communityPlatform.registeredMember.communities.membership.update(
      connection,
      {
        communityName: typia.assert<
          string &
            tags.MinLength<3> &
            tags.MaxLength<30> &
            tags.Pattern<"^[A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])$">
        >(alphaName),
        body: {
          join: true,
        } satisfies ICommunityPlatformCommunityMember.IUpdate,
      },
    );
  typia.assert(joinedAlpha);
  TestValidator.equals("join alpha → joined=true", joinedAlpha.joined, true);
  const alphaCountAfterJoin: number = joinedAlpha.memberCount;

  const joinedBeta =
    await api.functional.communityPlatform.registeredMember.communities.membership.update(
      connection,
      {
        communityName: typia.assert<
          string &
            tags.MinLength<3> &
            tags.MaxLength<30> &
            tags.Pattern<"^[A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])$">
        >(betaName),
        body: {
          join: true,
        } satisfies ICommunityPlatformCommunityMember.IUpdate,
      },
    );
  typia.assert(joinedBeta);
  TestValidator.equals("join beta → joined=true", joinedBeta.joined, true);
  const betaCountAfterJoin: number = joinedBeta.memberCount;

  // 4) List memberships and verify both present and no duplicates
  const list1 =
    await api.functional.communityPlatform.registeredMember.users.memberships.index(
      connection,
      { userId: authorized.id },
    );
  typia.assert(list1);

  const names1: string[] = list1.data.map((m) => m.community.name);
  const unique1 = new Set(names1);
  TestValidator.equals(
    "no duplicates in membership list after joining",
    unique1.size,
    names1.length,
  );
  TestValidator.predicate(
    "alpha is present in memberships after join",
    names1.includes(alphaName),
  );
  TestValidator.predicate(
    "beta is present in memberships after join",
    names1.includes(betaName),
  );

  // 5) Leave one community (beta) and verify it disappears, alpha remains
  const leftBeta =
    await api.functional.communityPlatform.registeredMember.communities.membership.update(
      connection,
      {
        communityName: typia.assert<
          string &
            tags.MinLength<3> &
            tags.MaxLength<30> &
            tags.Pattern<"^[A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])$">
        >(betaName),
        body: {
          join: false,
        } satisfies ICommunityPlatformCommunityMember.IUpdate,
      },
    );
  typia.assert(leftBeta);
  TestValidator.equals("leave beta → joined=false", leftBeta.joined, false);
  TestValidator.predicate(
    "memberCount non-increasing after leave (beta)",
    leftBeta.memberCount <= betaCountAfterJoin,
  );

  const list2 =
    await api.functional.communityPlatform.registeredMember.users.memberships.index(
      connection,
      { userId: authorized.id },
    );
  typia.assert(list2);
  const names2: string[] = list2.data.map((m) => m.community.name);
  TestValidator.predicate(
    "beta absent after leave",
    !names2.includes(betaName),
  );
  TestValidator.predicate(
    "alpha still present after leaving beta",
    names2.includes(alphaName),
  );

  // 6) Repeat leave to confirm idempotency; list remains unchanged wrt presence
  const leftBetaAgain =
    await api.functional.communityPlatform.registeredMember.communities.membership.update(
      connection,
      {
        communityName: typia.assert<
          string &
            tags.MinLength<3> &
            tags.MaxLength<30> &
            tags.Pattern<"^[A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])$">
        >(betaName),
        body: {
          join: false,
        } satisfies ICommunityPlatformCommunityMember.IUpdate,
      },
    );
  typia.assert(leftBetaAgain);
  TestValidator.equals(
    "idempotent leave keeps joined=false",
    leftBetaAgain.joined,
    false,
  );

  const list3 =
    await api.functional.communityPlatform.registeredMember.users.memberships.index(
      connection,
      { userId: authorized.id },
    );
  typia.assert(list3);
  const names3: string[] = list3.data.map((m) => m.community.name);
  TestValidator.predicate(
    "beta remains absent after repeated leave",
    !names3.includes(betaName),
  );
  TestValidator.predicate(
    "alpha remains present after repeated leave",
    names3.includes(alphaName),
  );
}
