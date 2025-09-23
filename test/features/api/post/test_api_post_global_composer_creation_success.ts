import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCategory";
import type { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformPost } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformPost";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";
import type { IECategorySortBy } from "@ORGANIZATION/PROJECT-api/lib/structures/IECategorySortBy";
import type { IESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IESortDirection";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformCategory";

/**
 * Create a post via the global composer into a specific community.
 *
 * Business flow:
 *
 * 1. Authenticate as communityMember (join)
 * 2. Discover an active category (or gracefully fallback)
 * 3. Create a community in that category
 * 4. Create a post via global composer by providing
 *    community_platform_community_id
 * 5. Validate linkages and echoed fields
 */
export async function test_api_post_global_composer_creation_success(
  connection: api.IConnection,
) {
  // Helper to generate a community name conforming to pattern:
  // ^[A-Za-z][A-Za-z0-9_-]{1,30}[A-Za-z0-9]$
  const generateCommunityName = (len: number): string => {
    const letters = [
      ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
    ] as const;
    const middleChars = [
      ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_",
    ] as const;
    const alnum = [
      ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
    ] as const;
    const length = Math.min(Math.max(len, 3), 32);
    const first = RandomGenerator.pick(letters);
    const last = RandomGenerator.pick(alnum);
    const middleLength = Math.max(0, length - 2);
    const middle = ArrayUtil.repeat(middleLength, () =>
      RandomGenerator.pick(middleChars),
    ).join("");
    return `${first}${middle}${last}`;
  };

  // 1) Authenticate as communityMember.
  const joinBody = {
    username: RandomGenerator.alphabets(10),
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const authorized: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(connection, {
      body: joinBody,
    });
  typia.assert(authorized);

  // 2) Discover category (prefer active). Try active=true first.
  const catReq1 = {
    active: true,
    limit: 20,
    sortBy: "display_order",
    direction: "asc",
  } satisfies ICommunityPlatformCategory.IRequest;
  const page1: IPageICommunityPlatformCategory.ISummary =
    await api.functional.communityPlatform.categories.index(connection, {
      body: catReq1,
    });
  typia.assert(page1);

  let category = page1.data.find((c) => c.active) ?? page1.data[0];
  if (!category) {
    // Fallback: relax filters
    const catReq2 = {
      limit: 20,
    } satisfies ICommunityPlatformCategory.IRequest;
    const page2: IPageICommunityPlatformCategory.ISummary =
      await api.functional.communityPlatform.categories.index(connection, {
        body: catReq2,
      });
    typia.assert(page2);
    category = page2.data[0];
  }
  if (!category)
    throw new Error("No categories available to create a community.");

  // 3) Create a community under the discovered category.
  const communityBody = {
    name: generateCommunityName(12),
    community_platform_category_id: category.id,
    description: null,
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community: ICommunityPlatformCommunity =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      { body: communityBody },
    );
  typia.assert(community);

  // 4) Create a post via global composer.
  const title = RandomGenerator.paragraph({ sentences: 5 });
  const body = RandomGenerator.content({
    paragraphs: 2,
    sentenceMin: 10,
    sentenceMax: 20,
    wordMin: 3,
    wordMax: 8,
  });
  const authorDisplayName = RandomGenerator.name(1);

  const postCreateBody = {
    community_platform_community_id: community.id,
    title,
    body,
    author_display_name: authorDisplayName,
  } satisfies ICommunityPlatformPost.ICreate;
  const post: ICommunityPlatformPost =
    await api.functional.communityPlatform.communityMember.posts.create(
      connection,
      { body: postCreateBody },
    );
  typia.assert(post);

  // 5) Business validations.
  TestValidator.equals(
    "post belongs to the created community",
    post.community_platform_community_id,
    community.id,
  );
  TestValidator.equals("post echoes title", post.title, title);
  TestValidator.equals("post echoes body", post.body, body);
  TestValidator.equals(
    "post echoes author display name",
    post.author_display_name,
    authorDisplayName,
  );
  if (post.author_user_id !== null && post.author_user_id !== undefined) {
    TestValidator.equals(
      "author matches authenticated member id (when provided)",
      post.author_user_id,
      authorized.id,
    );
  }
  TestValidator.predicate(
    "deleted_at should be null or undefined on creation",
    post.deleted_at === null || post.deleted_at === undefined,
  );
}
