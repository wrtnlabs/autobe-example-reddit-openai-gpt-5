import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IClientContext } from "@ORGANIZATION/PROJECT-api/lib/structures/IClientContext";
import type { ICommunityPlatformComment } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformComment";
import type { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";
import type { ICommunityPlatformCommunityRule } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityRule";
import type { ICommunityPlatformCommunityRuleArray } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityRuleArray";
import type { ICommunityPlatformPost } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformPost";
import type { ICommunityPlatformRegisteredMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRegisteredMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";
import type { IECommunityCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityCategory";
import type { IECommunityPlatformCommunityCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformCommunityCategory";
import type { IECommunityPlatformVoteState } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformVoteState";
import type { IEVoteState } from "@ORGANIZATION/PROJECT-api/lib/structures/IEVoteState";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformComment } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformComment";

/**
 * Validate global comments search Newest ordering and practical pagination.
 *
 * Business goals:
 *
 * - Seed a post with 25 comments containing a unique token (q >= 2) to ensure
 *   they match the comments search endpoint.
 * - Verify Newest ordering (createdAt DESC, id DESC) on a first-page request with
 *   limit=20.
 * - Verify page stability by fetching a larger result set (limit >= 25) and
 *   asserting that the smaller first page is a prefix of the larger result.
 * - Confirm all seeded comments are present in the larger result, without
 *   duplicates, and that post/community references match the created entities.
 *
 * Steps:
 *
 * 1. Join as a registered member (auth.registeredMember.join)
 * 2. Create a community with a valid name and category
 * 3. Create a post in the community with valid title/body
 * 4. Create 25 sequential comments containing a shared unique token (>= 2 chars)
 * 5. Search with limit=20 and validate ordering and references
 * 6. Search with a larger limit (>= 25) and validate stability, completeness, and
 *    non-duplication
 */
export async function test_api_comments_search_newest_sort_and_pagination(
  connection: api.IConnection,
) {
  // 1) Authenticate: register a new member
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    username: RandomGenerator.name(1),
    password: RandomGenerator.alphaNumeric(12),
    displayName: RandomGenerator.name(1),
  } satisfies ICommunityPlatformRegisteredMember.IJoin;
  const auth = await api.functional.auth.registeredMember.join(connection, {
    body: joinBody,
  });
  typia.assert(auth);

  // 2) Create a community (valid pattern: start/end alnum, 3-30 length)
  const communityName = `test${RandomGenerator.alphaNumeric(10)}`; // alphanumeric only, within 3-30
  const communityBody = {
    name: communityName,
    category: typia.random<IECommunityCategory>(),
    description: RandomGenerator.paragraph({ sentences: 8 }),
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      { body: communityBody },
    );
  typia.assert(community);
  TestValidator.equals(
    "created community name equals requested",
    community.name,
    communityName,
  );

  // 3) Create a post in the community
  const postBody = {
    communityName: community.name,
    title: RandomGenerator.paragraph({ sentences: 5 }),
    body: RandomGenerator.content({
      paragraphs: 1,
      sentenceMin: 12,
      sentenceMax: 20,
      wordMin: 3,
      wordMax: 8,
    }),
    authorDisplayName: RandomGenerator.name(1),
  } satisfies ICommunityPlatformPost.ICreate;
  const post =
    await api.functional.communityPlatform.registeredMember.posts.create(
      connection,
      { body: postBody },
    );
  typia.assert(post);
  TestValidator.equals(
    "post belongs to created community",
    post.community.name,
    community.name,
  );

  // 4) Seed 25 comments with a unique token to ensure search hits
  const token = `kw_${RandomGenerator.alphaNumeric(8)}`; // >=2 chars
  const createdComments: ICommunityPlatformComment[] = [];
  const total = 25;
  for (let i = 0; i < total; i++) {
    const body = {
      content: `${token} ${RandomGenerator.paragraph({ sentences: 8 })}`,
    } satisfies ICommunityPlatformComment.ICreate;
    const comment =
      await api.functional.communityPlatform.registeredMember.posts.comments.create(
        connection,
        { postId: post.id, body },
      );
    typia.assert(comment);
    createdComments.push(comment);
  }

  // Helper: verify Newest ordering (createdAt DESC, id DESC)
  const assertNewestOrder = (items: ICommunityPlatformComment.ISummary[]) => {
    for (let i = 1; i < items.length; i++) {
      const prev = items[i - 1];
      const curr = items[i];
      const prevTime = prev.createdAt;
      const currTime = curr.createdAt;
      const ok =
        prevTime > currTime || (prevTime === currTime && prev.id >= curr.id);
      if (!ok)
        throw new Error(
          `Ordering violation at index ${i}: prev(${prevTime}, ${prev.id}) < curr(${currTime}, ${curr.id})`,
        );
    }
  };

  // 5) Search first page (limit=20) with the token
  const page1 = await api.functional.communityPlatform.search.comments.index(
    connection,
    {
      body: {
        q: token,
        limit: 20,
      } satisfies ICommunityPlatformComment.IRequest,
    },
  );
  typia.assert(page1);
  const first = page1.data;
  TestValidator.predicate(
    "first page returns between 1 and 20 items",
    first.length > 0 && first.length <= 20,
  );
  assertNewestOrder(first);
  // Ensure all results belong to the created post/community (token isolates data)
  for (const s of first) {
    if (s.post)
      TestValidator.equals("post reference matches", s.post.id, post.id);
    if (s.community)
      TestValidator.equals(
        "community reference matches",
        s.community.name,
        community.name,
      );
  }

  // 6) Search larger result (limit sufficient to contain all 25)
  const pageAll = await api.functional.communityPlatform.search.comments.index(
    connection,
    {
      body: {
        q: token,
        limit: 100,
      } satisfies ICommunityPlatformComment.IRequest,
    },
  );
  typia.assert(pageAll);
  const all = pageAll.data;
  TestValidator.predicate(
    "larger fetch contains at least 25 seeded comments",
    all.length >= 25,
  );
  assertNewestOrder(all);
  // Prefix stability: first page equals prefix of the larger set
  TestValidator.equals(
    "first page is stable prefix of larger result",
    first,
    all.slice(0, first.length),
  );
  // All created IDs must appear in the larger result; no duplicates in larger set
  const allIds = new Set(all.map((x) => x.id));
  const uniqOk = allIds.size === all.length;
  TestValidator.predicate("no duplicate IDs in larger result", uniqOk);
  const seededIds = new Set(createdComments.map((c) => c.id));
  const containsAllSeeded = Array.from(seededIds).every((id) => allIds.has(id));
  TestValidator.predicate(
    "larger result contains all seeded comments",
    containsAllSeeded,
  );
}
