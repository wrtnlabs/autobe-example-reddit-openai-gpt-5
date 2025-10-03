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
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformComment } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformComment";

/**
 * Validate Newest ordering and default pagination behavior for post comments.
 *
 * Flow:
 *
 * 1. Register a member (auth join) to obtain an authenticated session.
 * 2. Create a community with a valid, unique name and allowed category.
 * 3. Create a text post in that community.
 * 4. Seed 30 comments under the post (content length within 2–2,000).
 * 5. List comments with default request (empty body → default limit=20) and
 *    validate:
 *
 *    - Returned item count is 20
 *    - All items belong to target post
 *    - Order respects createdAt DESC then id DESC
 * 6. List comments again with limit=100 to fetch all 30 and validate:
 *
 *    - Full list count equals created count (30)
 *    - Full list ordering is correct
 *    - First 20 of full list exactly equal first page items (stable boundary)
 *    - No duplicate IDs in the full listing
 *
 * Note: Original scenario referenced a nextCursor. The provided response DTO
 * does not expose a cursor token, so this test cross-validates the first page
 * using a full listing with a large limit instead of cursor continuation.
 */
export async function test_api_post_comments_list_newest_pagination(
  connection: api.IConnection,
) {
  // 1) Register a member (auth join) to obtain session
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    username: `user_${RandomGenerator.alphaNumeric(10)}`,
    password: RandomGenerator.alphaNumeric(16),
    displayName: RandomGenerator.name(1),
  } satisfies ICommunityPlatformRegisteredMember.IJoin;
  const me = await api.functional.auth.registeredMember.join(connection, {
    body: joinBody,
  });
  typia.assert<ICommunityPlatformRegisteredMember.IAuthorized>(me);

  // 2) Create a community with valid name and allowed category
  const communityName: string = `comm${RandomGenerator.alphaNumeric(12)}`; // 4+ chars, alnum only
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
  const community =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      {
        body: {
          name: communityName,
          category: RandomGenerator.pick(categories),
          description: RandomGenerator.paragraph({ sentences: 12 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert<ICommunityPlatformCommunity>(community);

  // 3) Create a post in that community
  const post =
    await api.functional.communityPlatform.registeredMember.posts.create(
      connection,
      {
        body: {
          communityName: community.name,
          title: RandomGenerator.paragraph({ sentences: 5 }),
          body: RandomGenerator.content({
            paragraphs: 1,
            sentenceMin: 15,
            sentenceMax: 25,
            wordMin: 3,
            wordMax: 9,
          }),
        } satisfies ICommunityPlatformPost.ICreate,
      },
    );
  typia.assert<ICommunityPlatformPost>(post);

  // 4) Seed 30 comments
  const createdComments: ICommunityPlatformComment[] = [];
  await ArrayUtil.asyncRepeat(30, async (index) => {
    const content = RandomGenerator.paragraph({ sentences: 8 + (index % 5) });
    const created =
      await api.functional.communityPlatform.registeredMember.posts.comments.create(
        connection,
        {
          postId: post.id,
          body: {
            content,
          } satisfies ICommunityPlatformComment.ICreate,
        },
      );
    typia.assert<ICommunityPlatformComment>(created);
    createdComments.push(created);
  });

  // Helper: verify Newest ordering (createdAt DESC, then id DESC)
  const isNewestOrdered = (list: ICommunityPlatformComment[]): boolean => {
    for (let i = 0; i + 1 < list.length; i++) {
      const a = list[i];
      const b = list[i + 1];
      const ta = new Date(a.createdAt).getTime();
      const tb = new Date(b.createdAt).getTime();
      if (ta < tb) return false; // must be non-increasing
      if (ta === tb && a.id < b.id) return false; // id DESC on tie
    }
    return true;
  };

  // 5) List with default request (expect default limit = 20)
  const page1 = await api.functional.communityPlatform.posts.comments.index(
    connection,
    {
      postId: post.id,
      body: {} satisfies ICommunityPlatformComment.IRequest,
    },
  );
  typia.assert<IPageICommunityPlatformComment>(page1);

  TestValidator.equals(
    "first page returns 20 items by default",
    page1.data.length,
    20,
  );
  TestValidator.predicate(
    "first page: all items belong to target post",
    page1.data.every((c) => c.postId === post.id),
  );
  TestValidator.predicate(
    "first page: Newest ordering (createdAt DESC then id DESC)",
    isNewestOrdered(page1.data),
  );

  // 6) List with large limit to fetch all 30 and cross-validate ordering and prefix equality
  const full = await api.functional.communityPlatform.posts.comments.index(
    connection,
    {
      postId: post.id,
      body: {
        limit: 100,
      } satisfies ICommunityPlatformComment.IRequest,
    },
  );
  typia.assert<IPageICommunityPlatformComment>(full);

  TestValidator.equals(
    "full listing returns all created comments (<=100)",
    full.data.length,
    createdComments.length,
  );
  TestValidator.predicate(
    "full list: all items belong to target post",
    full.data.every((c) => c.postId === post.id),
  );
  TestValidator.predicate(
    "full list: Newest ordering (createdAt DESC then id DESC)",
    isNewestOrdered(full.data),
  );

  // First page must equal first portion of full list
  const idsPage1 = page1.data.map((c) => c.id);
  const idsFullPrefix = full.data.slice(0, idsPage1.length).map((c) => c.id);
  TestValidator.equals(
    "first page equals prefix of full list",
    idsPage1,
    idsFullPrefix,
  );

  // No duplicate IDs in the full listing
  const uniqueCount = new Set(full.data.map((c) => c.id)).size;
  TestValidator.equals(
    "no duplicate IDs in full listing",
    uniqueCount,
    full.data.length,
  );
}
