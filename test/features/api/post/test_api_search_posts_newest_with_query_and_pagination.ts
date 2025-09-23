import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformPost } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformPost";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformPost } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformPost";

export async function test_api_search_posts_newest_with_query_and_pagination(
  connection: api.IConnection,
) {
  /**
   * Validate post search with Newest ordering and pagination.
   *
   * Steps:
   *
   * 1. Join as community member (auth token auto-applied by SDK)
   * 2. Create a community to scope posts/searches
   * 3. Create two posts in the community:
   *
   *    - PostMatch: title contains a unique keyword
   *    - PostOther: guaranteed not to contain the keyword
   * 4. Search with sort=newest, community scope, and limit=10 and validate:
   *
   *    - Only the matching post is returned
   *    - Pagination information is consistent
   * 5. Search again with limit=1 to validate pagination stability and page 2 is
   *    empty
   * 6. Soft-delete the matching post; re-run the search and expect zero results
   * 7. Negative: one-character query should result in an error
   */

  // 1) Join as a community member
  const joinBody = {
    username: `${RandomGenerator.name(1)}_${RandomGenerator.alphaNumeric(6)}`,
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const memberAuth: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(connection, {
      body: joinBody,
    });
  typia.assert(memberAuth);

  // 2) Create a community
  const communityName = `c${RandomGenerator.alphaNumeric(6)}${RandomGenerator.pick(
    [..."abcdefghijklmnopqrstuvwxyz0123456789"],
  )}`;
  const createCommunityBody = {
    name: communityName,
    community_platform_category_id: typia.random<
      string & tags.Format<"uuid">
    >(),
    description: RandomGenerator.paragraph({ sentences: 6 }),
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community: ICommunityPlatformCommunity =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      { body: createCommunityBody },
    );
  typia.assert(community);

  // Helper to ensure a title not containing a specific keyword
  const makeTitleExcluding = (exclude: string): string => {
    for (let i = 0; i < 10; i++) {
      const t = RandomGenerator.paragraph({
        sentences: 3,
        wordMin: 3,
        wordMax: 8,
      });
      if (!t.includes(exclude)) return t;
    }
    return `post_${RandomGenerator.alphaNumeric(8)}`; // guaranteed fallback without the exclude token
  };

  // 3) Create two posts: one with a unique keyword and another without it
  // Ensure keyword is a single token with no spaces (take the first word)
  const keywordSource = RandomGenerator.paragraph({
    sentences: 1,
    wordMin: 7,
    wordMax: 10,
  });
  const keyword = keywordSource.split(" ")[0];

  const postMatchBody = {
    title: `${keyword} ${RandomGenerator.paragraph({ sentences: 2 })}`,
    body: RandomGenerator.content({
      paragraphs: 2,
      sentenceMin: 8,
      sentenceMax: 15,
      wordMin: 3,
      wordMax: 8,
    }),
  } satisfies ICommunityPlatformPost.ICreate;
  const postMatch: ICommunityPlatformPost =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      {
        communityId: community.id,
        body: postMatchBody,
      },
    );
  typia.assert(postMatch);

  const postOtherBody = {
    title: makeTitleExcluding(keyword),
    body: RandomGenerator.content({
      paragraphs: 2,
      sentenceMin: 8,
      sentenceMax: 15,
      wordMin: 3,
      wordMax: 8,
    }),
  } satisfies ICommunityPlatformPost.ICreate;
  const postOther: ICommunityPlatformPost =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      {
        communityId: community.id,
        body: postOtherBody,
      },
    );
  typia.assert(postOther);

  // 4) Search with sort=newest and community scope, expecting only the matching post
  const searchBodyAll = {
    page: 1,
    limit: 10,
    search: keyword,
    sort: "newest" as const,
    community_id: community.id,
  } satisfies ICommunityPlatformPost.IRequest;
  const pageAll: IPageICommunityPlatformPost.ISummary =
    await api.functional.communityPlatform.search.posts.index(connection, {
      body: searchBodyAll,
    });
  typia.assert(pageAll);

  TestValidator.equals(
    "only one matching record should be returned",
    pageAll.data.length,
    1,
  );
  TestValidator.equals(
    "matched id equals created matching post id",
    pageAll.data[0]?.id,
    postMatch.id,
  );
  TestValidator.equals(
    "records should be 1 as well",
    pageAll.pagination.records,
    1,
  );

  // 5) Pagination stability with limit=1
  const searchBodyPage1 = {
    page: 1,
    limit: 1,
    search: keyword,
    sort: "newest" as const,
    community_id: community.id,
  } satisfies ICommunityPlatformPost.IRequest;
  const firstPage: IPageICommunityPlatformPost.ISummary =
    await api.functional.communityPlatform.search.posts.index(connection, {
      body: searchBodyPage1,
    });
  typia.assert(firstPage);
  TestValidator.equals(
    "first page (limit=1) returns one record",
    firstPage.data.length,
    1,
  );
  TestValidator.equals(
    "first page top id equals matching post id",
    firstPage.data[0]?.id,
    postMatch.id,
  );

  const searchBodyPage2 = {
    page: 2,
    limit: 1,
    search: keyword,
    sort: "newest" as const,
    community_id: community.id,
  } satisfies ICommunityPlatformPost.IRequest;
  const secondPage: IPageICommunityPlatformPost.ISummary =
    await api.functional.communityPlatform.search.posts.index(connection, {
      body: searchBodyPage2,
    });
  typia.assert(secondPage);
  TestValidator.equals(
    "second page (limit=1) should be empty when only one match exists",
    secondPage.data.length,
    0,
  );

  // 6) Soft-delete the matching post and ensure exclusion from search
  await api.functional.communityPlatform.communityMember.posts.erase(
    connection,
    {
      postId: postMatch.id,
    },
  );
  const afterDelete: IPageICommunityPlatformPost.ISummary =
    await api.functional.communityPlatform.search.posts.index(connection, {
      body: searchBodyAll,
    });
  typia.assert(afterDelete);
  TestValidator.equals(
    "no results after soft-deleting the matching post",
    afterDelete.data.length,
    0,
  );
  TestValidator.equals(
    "records should be 0 after deletion",
    afterDelete.pagination.records,
    0,
  );

  // 7) Negative: one-character query should produce validation-style error
  await TestValidator.error(
    "one-character search query should be rejected",
    async () => {
      await api.functional.communityPlatform.search.posts.index(connection, {
        body: {
          page: 1,
          limit: 10,
          search: keyword.substring(0, 1),
          sort: "newest",
          community_id: community.id,
        } satisfies ICommunityPlatformPost.IRequest,
      });
    },
  );
}
