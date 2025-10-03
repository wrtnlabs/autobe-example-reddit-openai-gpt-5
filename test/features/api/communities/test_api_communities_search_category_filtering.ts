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
import type { IECommunitySort } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunitySort";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformCommunity";

export async function test_api_communities_search_category_filtering(
  connection: api.IConnection,
) {
  /**
   * Validate category-filtered community search with sort options.
   *
   * Steps:
   *
   * 1. Register a new member to gain authenticated access.
   * 2. Create multiple communities in two categories (Tech & Programming, Sports),
   *    embedding a shared token in their names for searchability.
   * 3. Normalize membership: leave all, then join only the Tech communities to
   *    guarantee visible memberCount changes for those items.
   * 4. Search with category filter (nameMatch): ensure only Tech category results
   *    are returned, names contain the token, Sports items are excluded, and at
   *    least one of the created Tech items appears. For joined items,
   *    memberCount should be >= 1.
   * 5. Search with category filter (recentlyCreated): ensure only Tech category
   *    results are returned and createdAt is non-increasing (DESC).
   */

  // 1) Register a new member
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const username: string = `${RandomGenerator.name(1)}_${RandomGenerator.alphaNumeric(6)}`;
  const auth = await api.functional.auth.registeredMember.join(connection, {
    body: {
      email,
      username,
      password: `Pw_${RandomGenerator.alphaNumeric(12)}`,
      displayName: RandomGenerator.name(2),
      client: undefined,
    } satisfies ICommunityPlatformRegisteredMember.IJoin,
  });
  typia.assert(auth);

  // 2) Create multiple communities across two categories with a shared token
  const token = RandomGenerator.alphabets(3); // shared searchable token (>=2)
  const categoryTech: IECommunityCategory = "Tech & Programming";
  const categorySports: IECommunityCategory = "Sports";

  const makeName = (base: string) =>
    `${token}${base}${RandomGenerator.alphaNumeric(6)}`;

  const techCreateBodies = [
    {
      name: makeName("tech"),
      category: categoryTech,
      description: RandomGenerator.paragraph({ sentences: 6 }),
    } satisfies ICommunityPlatformCommunity.ICreate,
    {
      name: makeName("code"),
      category: categoryTech,
      description: RandomGenerator.paragraph({ sentences: 6 }),
    } satisfies ICommunityPlatformCommunity.ICreate,
  ];
  const sportsCreateBodies = [
    {
      name: makeName("sports"),
      category: categorySports,
      description: RandomGenerator.paragraph({ sentences: 6 }),
    } satisfies ICommunityPlatformCommunity.ICreate,
    {
      name: makeName("ball"),
      category: categorySports,
      description: RandomGenerator.paragraph({ sentences: 6 }),
    } satisfies ICommunityPlatformCommunity.ICreate,
  ];

  const techCommunities: ICommunityPlatformCommunity[] = [];
  const sportsCommunities: ICommunityPlatformCommunity[] = [];

  for (const body of techCreateBodies) {
    const created =
      await api.functional.communityPlatform.registeredMember.communities.create(
        connection,
        { body },
      );
    typia.assert(created);
    techCommunities.push(created);
  }
  for (const body of sportsCreateBodies) {
    const created =
      await api.functional.communityPlatform.registeredMember.communities.create(
        connection,
        { body },
      );
    typia.assert(created);
    sportsCommunities.push(created);
  }

  // 3) Normalize membership: ensure all are left, then join only tech communities
  const allCommunities = [...techCommunities, ...sportsCommunities];
  for (const community of allCommunities) {
    const left =
      await api.functional.communityPlatform.registeredMember.communities.membership.update(
        connection,
        {
          communityName: community.name as string &
            tags.MinLength<3> &
            tags.MaxLength<30> &
            tags.Pattern<"^[A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])$">,
          body: {
            join: false,
          } satisfies ICommunityPlatformCommunityMember.IUpdate,
        },
      );
    typia.assert(left);
  }
  for (const community of techCommunities) {
    const joined =
      await api.functional.communityPlatform.registeredMember.communities.membership.update(
        connection,
        {
          communityName: community.name as string &
            tags.MinLength<3> &
            tags.MaxLength<30> &
            tags.Pattern<"^[A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])$">,
          body: {
            join: true,
          } satisfies ICommunityPlatformCommunityMember.IUpdate,
        },
      );
    typia.assert(joined);
  }

  // Helper: check non-increasing createdAt
  const isNonIncreasingCreatedAt = (
    items: { createdAt: string }[],
  ): boolean => {
    for (let i = 1; i < items.length; i++) {
      const prev = Date.parse(items[i - 1].createdAt);
      const curr = Date.parse(items[i].createdAt);
      if (prev < curr) return false;
    }
    return true;
  };

  // 4) Search with category filter (nameMatch)
  const pageNameMatch =
    await api.functional.communityPlatform.search.communities.index(
      connection,
      {
        body: {
          q: token,
          category: categoryTech,
          sort: "nameMatch",
        } satisfies ICommunityPlatformCommunity.IRequest,
      },
    );
  typia.assert(pageNameMatch);

  // Assertions for nameMatch
  TestValidator.predicate(
    "nameMatch: every item is in the filtered category and contains the token",
    () =>
      pageNameMatch.data.every(
        (x) =>
          x.category === categoryTech &&
          x.name.toLowerCase().includes(token.toLowerCase()),
      ),
  );

  const sportsNames = sportsCommunities.map((c) => c.name);
  const presentSports = pageNameMatch.data.filter((x) =>
    sportsNames.includes(x.name),
  );
  TestValidator.equals(
    "nameMatch: category filter excludes communities from other categories",
    presentSports.length,
    0,
  );

  const techNames = techCommunities.map((c) => c.name);
  const presentTech = pageNameMatch.data.filter((x) =>
    techNames.includes(x.name),
  );
  TestValidator.predicate(
    "nameMatch: at least one created Tech community appears in results",
    presentTech.length >= 1,
  );

  // For joined communities, memberCount should be >= 1
  for (const item of pageNameMatch.data) {
    if (techNames.includes(item.name)) {
      TestValidator.predicate(
        `nameMatch: memberCount for joined community ${item.name} is >= 1`,
        item.memberCount >= 1,
      );
    }
  }

  // 5) Search with category filter (recentlyCreated)
  const pageRecentlyCreated =
    await api.functional.communityPlatform.search.communities.index(
      connection,
      {
        body: {
          q: token,
          category: categoryTech,
          sort: "recentlyCreated",
        } satisfies ICommunityPlatformCommunity.IRequest,
      },
    );
  typia.assert(pageRecentlyCreated);

  TestValidator.predicate(
    "recentlyCreated: every item is in the filtered category",
    () => pageRecentlyCreated.data.every((x) => x.category === categoryTech),
  );
  TestValidator.predicate(
    "recentlyCreated: createdAt is non-increasing (DESC)",
    isNonIncreasingCreatedAt(pageRecentlyCreated.data),
  );
}
