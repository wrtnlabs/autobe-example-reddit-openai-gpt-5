import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCategory";
import type { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformPost } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformPost";
import type { ICommunityPlatformPostSnapshot } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformPostSnapshot";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";
import type { IECategorySortBy } from "@ORGANIZATION/PROJECT-api/lib/structures/IECategorySortBy";
import type { IEOrderDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IEOrderDirection";
import type { IEPostSnapshotOrderBy } from "@ORGANIZATION/PROJECT-api/lib/structures/IEPostSnapshotOrderBy";
import type { IESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IESortDirection";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformCategory";
import type { IPageICommunityPlatformPostSnapshot } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformPostSnapshot";

/**
 * Verify that reading a post snapshot by historyId is scoped to its parent
 * post.
 *
 * Scenario:
 *
 * - Join as a community member.
 * - List active categories and pick one.
 * - Create a community in that category.
 * - Create two posts (Post A and Post B) within the community.
 * - Update both posts to produce snapshot histories.
 * - List Post A's snapshots and take a historyId.
 * - Attempt to read that snapshot via Post B's postId (mismatched pair) and
 *   validate that an error occurs.
 *
 * Why necessary:
 *
 * - Ensures the endpoint enforces parent-child scoping, preventing cross-post
 *   access to snapshots.
 *
 * Notes:
 *
 * - We validate the failure using TestValidator.error without asserting any
 *   specific HTTP status code per E2E rules.
 */
export async function test_api_post_history_detail_mismatched_post_and_history_id_not_found(
  connection: api.IConnection,
) {
  // 1) Authenticate (join) as a community member; SDK manages token
  const joinBody = {
    username: RandomGenerator.name(1),
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

  // 2) List active categories to find a valid category id
  const categoriesReq = {
    active: true,
    page: 1,
    limit: 20,
    sortBy: "display_order" as IECategorySortBy,
    direction: "asc" as IESortDirection,
  } satisfies ICommunityPlatformCategory.IRequest;
  const categories = await api.functional.communityPlatform.categories.index(
    connection,
    { body: categoriesReq },
  );
  typia.assert(categories);
  TestValidator.predicate(
    "at least one active category exists",
    categories.data.length > 0,
  );
  const firstCategory = categories.data[0];
  typia.assertGuard(firstCategory!);

  // 3) Create a community under the chosen category
  const communityName = `${RandomGenerator.alphabets(1)}${RandomGenerator.alphaNumeric(10)}`; // starts with letter; [a-z0-9]
  const communityBody = {
    name: communityName,
    community_platform_category_id: firstCategory.id,
    description: RandomGenerator.paragraph({ sentences: 8 }),
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      { body: communityBody },
    );
  typia.assert(community);

  // 4) Create two posts in the community (Post A and Post B)
  const postABody = {
    title: RandomGenerator.paragraph({ sentences: 5 }),
    body: RandomGenerator.content({
      paragraphs: 1,
      sentenceMin: 12,
      sentenceMax: 20,
      wordMin: 3,
      wordMax: 8,
    }),
  } satisfies ICommunityPlatformPost.ICreate;
  const postA =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      { communityId: community.id, body: postABody },
    );
  typia.assert(postA);

  const postBBody = {
    title: RandomGenerator.paragraph({ sentences: 6 }),
    body: RandomGenerator.content({
      paragraphs: 1,
      sentenceMin: 12,
      sentenceMax: 20,
      wordMin: 3,
      wordMax: 8,
    }),
  } satisfies ICommunityPlatformPost.ICreate;
  const postB =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      { communityId: community.id, body: postBBody },
    );
  typia.assert(postB);

  // Sanity: posts belong to community
  TestValidator.equals(
    "post A belongs to created community",
    postA.community_platform_community_id,
    community.id,
  );
  TestValidator.equals(
    "post B belongs to created community",
    postB.community_platform_community_id,
    community.id,
  );

  // 5) Update each post to generate snapshot history
  const postAUpdate1 = {
    title: RandomGenerator.paragraph({ sentences: 5 }),
    body: RandomGenerator.content({
      paragraphs: 1,
      sentenceMin: 10,
      sentenceMax: 18,
      wordMin: 3,
      wordMax: 8,
    }),
  } satisfies ICommunityPlatformPost.IUpdate;
  const postAAfterUpdate =
    await api.functional.communityPlatform.communityMember.posts.update(
      connection,
      { postId: postA.id, body: postAUpdate1 },
    );
  typia.assert(postAAfterUpdate);

  const postBUpdate1 = {
    title: RandomGenerator.paragraph({ sentences: 5 }),
    body: RandomGenerator.content({
      paragraphs: 1,
      sentenceMin: 10,
      sentenceMax: 18,
      wordMin: 3,
      wordMax: 8,
    }),
  } satisfies ICommunityPlatformPost.IUpdate;
  const postBAfterUpdate =
    await api.functional.communityPlatform.communityMember.posts.update(
      connection,
      { postId: postB.id, body: postBUpdate1 },
    );
  typia.assert(postBAfterUpdate);

  // 6) List snapshots for Post A and ensure we have at least one
  const historyReqA1 = {
    page: 1,
    limit: 10,
    orderBy: "created_at" as IEPostSnapshotOrderBy,
    direction: "desc" as IEOrderDirection,
  } satisfies ICommunityPlatformPostSnapshot.IRequest;
  let pageA = await api.functional.communityPlatform.posts.history.index(
    connection,
    { postId: postA.id, body: historyReqA1 },
  );
  typia.assert(pageA);
  if (pageA.data.length === 0) {
    // Perform one more update on Post A to ensure a snapshot is created, then re-list
    const postAUpdate2 = {
      title: RandomGenerator.paragraph({ sentences: 5 }),
      body: RandomGenerator.content({
        paragraphs: 1,
        sentenceMin: 10,
        sentenceMax: 18,
        wordMin: 3,
        wordMax: 8,
      }),
    } satisfies ICommunityPlatformPost.IUpdate;
    const postAAfterUpdate2 =
      await api.functional.communityPlatform.communityMember.posts.update(
        connection,
        { postId: postA.id, body: postAUpdate2 },
      );
    typia.assert(postAAfterUpdate2);

    pageA = await api.functional.communityPlatform.posts.history.index(
      connection,
      { postId: postA.id, body: historyReqA1 },
    );
    typia.assert(pageA);
  }
  TestValidator.predicate(
    "post A should have at least one snapshot",
    pageA.data.length > 0,
  );
  const firstSnapshotA = pageA.data[0];
  typia.assertGuard(firstSnapshotA!);

  // 7) Attempt mismatched retrieval: use Post B's postId with Post A's historyId
  await TestValidator.error(
    "mismatched postId and historyId must be rejected",
    async () => {
      await api.functional.communityPlatform.posts.history.at(connection, {
        postId: postB.id,
        historyId: firstSnapshotA.id,
      });
    },
  );
}
