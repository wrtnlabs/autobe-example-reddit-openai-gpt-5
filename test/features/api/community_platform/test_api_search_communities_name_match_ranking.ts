import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformCommunity";

export async function test_api_search_communities_name_match_ranking(
  connection: api.IConnection,
) {
  /**
   * Validate Name Match ranking and minimum query length.
   *
   * Steps:
   *
   * 1. Join as a community member (handles auth token automatically).
   * 2. (Simulation-only) Create two similarly named communities under two
   *    categories.
   * 3. Search with the base query and, when applicable, validate ranking (exact
   *    match before suffix).
   * 4. Ensure one-character query triggers an error per policy.
   */
  // 1) Join as a community member
  const joinBody = {
    username: `${RandomGenerator.name(1)}_${RandomGenerator.alphaNumeric(6)}`,
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

  // Prepare deterministic names for ranking tests
  const base = `${RandomGenerator.alphabets(1)}${RandomGenerator.alphaNumeric(5)}`; // starts with letter, total 6 chars
  const nameExact = base;
  const nameWithSuffix = `${base}-group`; // matches pattern and length constraints

  // 2) (Simulation-only) Create two communities to exercise ranking deterministically
  if (connection.simulate === true) {
    const categoryA = typia.random<string & tags.Format<"uuid">>();
    const categoryB = typia.random<string & tags.Format<"uuid">>();

    const community1 =
      await api.functional.communityPlatform.communityMember.communities.create(
        connection,
        {
          body: {
            name: nameWithSuffix,
            community_platform_category_id: categoryA,
            description: null,
            logo: null,
            banner: null,
          } satisfies ICommunityPlatformCommunity.ICreate,
        },
      );
    typia.assert(community1);

    const community2 =
      await api.functional.communityPlatform.communityMember.communities.create(
        connection,
        {
          body: {
            name: nameExact,
            community_platform_category_id: categoryB,
            description: null,
            logo: null,
            banner: null,
          } satisfies ICommunityPlatformCommunity.ICreate,
        },
      );
    typia.assert(community2);
  }

  // 3) Search by base query (Name Match ranking)
  const page = await api.functional.communityPlatform.search.communities.index(
    connection,
    {
      body: {
        query: base,
        limit: 20,
      } satisfies ICommunityPlatformCommunity.IRequest,
    },
  );
  typia.assert(page);

  // Ranking validation only makes sense if our created names are present
  if (connection.simulate === true) {
    const idxExact = page.data.findIndex(
      (c) => c.name.toLowerCase() === nameExact.toLowerCase(),
    );
    const idxSuffix = page.data.findIndex(
      (c) => c.name.toLowerCase() === nameWithSuffix.toLowerCase(),
    );

    TestValidator.predicate(
      "both created communities should appear in search results (simulation-only check)",
      idxExact >= 0 && idxSuffix >= 0,
    );
    if (idxExact >= 0 && idxSuffix >= 0) {
      TestValidator.predicate(
        "exact name match should be ranked before suffix variant (simulation-only)",
        idxExact < idxSuffix,
      );
    }
  }

  // 4) Minimum query length policy: one-character query should error
  await TestValidator.error(
    "one-character query must be rejected",
    async () => {
      await api.functional.communityPlatform.search.communities.index(
        connection,
        {
          body: {
            query: RandomGenerator.alphabets(1),
            limit: 10,
          } satisfies ICommunityPlatformCommunity.IRequest,
        },
      );
    },
  );
}
