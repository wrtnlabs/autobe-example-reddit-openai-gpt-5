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

/**
 * Validate Recently Created sorting and category filtering for communities.
 *
 * Business flow:
 *
 * 1. Join as a community member (auth handled by SDK)
 * 2. Create two communities with a shared unique name prefix but different
 *    categories
 * 3. Search by the shared prefix with sort_by=created_at and sort_dir=desc
 * 4. Verify newest-first ordering (second created appears before first)
 * 5. Apply category filter to ensure only the matching community appears
 */
export async function test_api_search_communities_recently_created_sort_and_category_filter(
  connection: api.IConnection,
) {
  // 1) Authenticate (join as community member)
  const joinBody = {
    username: `e2e_${RandomGenerator.alphabets(8)}`,
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12), // >= 8 chars
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const authorized = await api.functional.auth.communityMember.join(
    connection,
    {
      body: joinBody,
    },
  );
  typia.assert(authorized);

  // 2) Prepare categories (treated as seeded/fixture IDs in environment)
  const categoryA: string & tags.Format<"uuid"> = typia.random<
    string & tags.Format<"uuid">
  >();
  let categoryB: string & tags.Format<"uuid"> = typia.random<
    string & tags.Format<"uuid">
  >();
  if (categoryB === categoryA)
    categoryB = typia.random<string & tags.Format<"uuid">>();

  // Shared unique base prefix for both community names so that search query targets only these
  const basePrefix: string = `e2e${RandomGenerator.alphabets(6)}`; // starts with letter, length OK
  const name1: string = `${basePrefix}_${RandomGenerator.alphabets(4)}`; // ends with alpha
  const name2: string = `${basePrefix}_${RandomGenerator.alphabets(4)}`; // ends with alpha

  // 3) Create first (older) community
  const createBody1 = {
    name: name1,
    community_platform_category_id: categoryA,
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community1 =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      { body: createBody1 },
    );
  typia.assert(community1);

  // 4) Create second (newer) community
  const createBody2 = {
    name: name2,
    community_platform_category_id: categoryB,
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community2 =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      { body: createBody2 },
    );
  typia.assert(community2);

  // 5) Search with Recently Created sorting (created_at desc) using shared prefix
  const searchAllBody = {
    query: basePrefix,
    sort_by: "created_at",
    sort_dir: "desc",
  } satisfies ICommunityPlatformCommunity.IRequest;
  const pageAll =
    await api.functional.communityPlatform.search.communities.index(
      connection,
      { body: searchAllBody },
    );
  typia.assert(pageAll);

  // Ensure both communities are present and newest-first ordering holds
  const idsAll = pageAll.data.map((d) => d.id);
  const idx1 = idsAll.indexOf(community1.id);
  const idx2 = idsAll.indexOf(community2.id);
  TestValidator.predicate(
    "both created communities should appear in the search result",
    idx1 !== -1 && idx2 !== -1,
  );
  TestValidator.predicate(
    "newest-first ordering places second-created before first-created",
    idx2 !== -1 && idx1 !== -1 && idx2 < idx1,
  );

  // 6) Apply category filter for categoryA and validate only the matching community among the two
  const searchCatABody = {
    query: basePrefix,
    sort_by: "created_at",
    sort_dir: "desc",
    community_platform_category_id: categoryA,
  } satisfies ICommunityPlatformCommunity.IRequest;
  const pageCatA =
    await api.functional.communityPlatform.search.communities.index(
      connection,
      { body: searchCatABody },
    );
  typia.assert(pageCatA);

  const hasCommunity1InA = ArrayUtil.has(
    pageCatA.data,
    (e) => e.id === community1.id,
  );
  const hasCommunity2InA = ArrayUtil.has(
    pageCatA.data,
    (e) => e.id === community2.id,
  );
  TestValidator.predicate(
    "category filter A includes the first community (categoryA)",
    hasCommunity1InA,
  );
  TestValidator.predicate(
    "category filter A excludes the second community (categoryB)",
    !hasCommunity2InA,
  );

  // 7) Optionally, verify categoryB filter mirrors behavior
  const searchCatBBody = {
    query: basePrefix,
    sort_by: "created_at",
    sort_dir: "desc",
    community_platform_category_id: categoryB,
  } satisfies ICommunityPlatformCommunity.IRequest;
  const pageCatB =
    await api.functional.communityPlatform.search.communities.index(
      connection,
      { body: searchCatBBody },
    );
  typia.assert(pageCatB);

  const hasCommunity2InB = ArrayUtil.has(
    pageCatB.data,
    (e) => e.id === community2.id,
  );
  const hasCommunity1InB = ArrayUtil.has(
    pageCatB.data,
    (e) => e.id === community1.id,
  );
  TestValidator.predicate(
    "category filter B includes the second community (categoryB)",
    hasCommunity2InB,
  );
  TestValidator.predicate(
    "category filter B excludes the first community (categoryA)",
    !hasCommunity1InB,
  );
}
