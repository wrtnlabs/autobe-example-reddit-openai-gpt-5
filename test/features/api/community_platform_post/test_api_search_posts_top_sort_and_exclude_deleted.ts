import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformPost } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformPost";
import type { ICommunityPlatformPostVote } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformPostVote";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";
import type { IEPostVoteState } from "@ORGANIZATION/PROJECT-api/lib/structures/IEPostVoteState";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformPost } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformPost";

export async function test_api_search_posts_top_sort_and_exclude_deleted(
  connection: api.IConnection,
) {
  /**
   * Validate Top sorting by score and exclusion of soft-deleted posts.
   *
   * Flow (adapted for available auth APIs and automatic token switching):
   *
   * 1. Author joins → creates a community → creates two posts (P1, P2) →
   *    soft-deletes P2
   * 2. Voter joins → upvotes P1 to ensure it leads Top sort
   * 3. Search with sort = "top" scoped to the community → expect P1 present and
   *    ranked first; P2 excluded
   */
  // 1) Author joins
  const authorJoin = await api.functional.auth.communityMember.join(
    connection,
    {
      body: {
        username: `author_${RandomGenerator.alphaNumeric(8)}`,
        email: `${RandomGenerator.alphaNumeric(8)}@example.com`,
        password: RandomGenerator.alphaNumeric(10),
      } satisfies ICommunityPlatformCommunityMember.ICreate,
    },
  );
  typia.assert(authorJoin);

  // Create a community owned by Author
  const communityName = `c${RandomGenerator.alphaNumeric(8)}`; // starts with a letter, 3-32 chars
  const community: ICommunityPlatformCommunity =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      {
        body: {
          name: communityName,
          community_platform_category_id: typia.random<
            string & tags.Format<"uuid">
          >(),
          description: RandomGenerator.paragraph({ sentences: 6 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);

  // Create two posts P1 and P2 under the community (as Author)
  const postP1: ICommunityPlatformPost =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      {
        communityId: community.id,
        body: {
          title: RandomGenerator.paragraph({ sentences: 5 }),
          body: RandomGenerator.content({
            paragraphs: 1,
            sentenceMin: 12,
            sentenceMax: 20,
          }),
          author_display_name: RandomGenerator.name(1),
        } satisfies ICommunityPlatformPost.ICreate,
      },
    );
  typia.assert(postP1);

  const postP2: ICommunityPlatformPost =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      {
        communityId: community.id,
        body: {
          title: RandomGenerator.paragraph({ sentences: 6 }),
          body: RandomGenerator.content({
            paragraphs: 1,
            sentenceMin: 12,
            sentenceMax: 20,
          }),
          author_display_name: RandomGenerator.name(1),
        } satisfies ICommunityPlatformPost.ICreate,
      },
    );
  typia.assert(postP2);

  // Soft-delete P2 (author-only action)
  await api.functional.communityPlatform.communityMember.posts.erase(
    connection,
    {
      postId: postP2.id,
    },
  );

  // 2) Voter joins (auto-switch token to voter)
  const voterJoin = await api.functional.auth.communityMember.join(connection, {
    body: {
      username: `voter_${RandomGenerator.alphaNumeric(8)}`,
      email: `${RandomGenerator.alphaNumeric(8)}@example.com`,
      password: RandomGenerator.alphaNumeric(10),
    } satisfies ICommunityPlatformCommunityMember.ICreate,
  });
  typia.assert(voterJoin);

  // Voter upvotes P1 to give it top score within the community
  const voteUpP1: ICommunityPlatformPostVote =
    await api.functional.communityPlatform.communityMember.posts.votes.update(
      connection,
      {
        postId: postP1.id,
        body: { state: "up" } satisfies ICommunityPlatformPostVote.IUpdate,
      },
    );
  typia.assert(voteUpP1);

  // 3) Search with Top sort in the community scope
  const searchRequest = {
    page: 1,
    limit: 10,
    sort: "top",
    community_id: community.id,
  } satisfies ICommunityPlatformPost.IRequest;

  const page: IPageICommunityPlatformPost.ISummary =
    await api.functional.communityPlatform.search.posts.index(connection, {
      body: searchRequest,
    });
  typia.assert(page);

  // Assertions
  TestValidator.predicate(
    "search results should contain at least one post",
    page.data.length >= 1,
  );

  // P1 should be first (ranked highest under Top sort)
  TestValidator.equals(
    "P1 should be ranked first in Top sort",
    page.data[0]?.id,
    postP1.id,
  );

  // P2 must be excluded due to soft deletion
  const hasP2 = page.data.some((s) => s.id === postP2.id);
  TestValidator.predicate("P2 should be excluded from results", !hasP2);
}
