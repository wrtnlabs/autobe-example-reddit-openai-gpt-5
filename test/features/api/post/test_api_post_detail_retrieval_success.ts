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
 * Public post detail retrieval should succeed.
 *
 * Scenario:
 *
 * 1. Register a community member (authenticated setup)
 * 2. Discover an active category
 * 3. Create a community using that category
 * 4. Create a post in the community
 * 5. Read the post publicly (without authentication headers) and validate fields
 */
export async function test_api_post_detail_retrieval_success(
  connection: api.IConnection,
) {
  // 1) Join as community member for setup
  const memberBody = {
    username: `user_${RandomGenerator.alphaNumeric(8)}`,
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const auth: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(connection, {
      body: memberBody,
    });
  typia.assert(auth);

  // 2) Find an active category (first page, deterministic ordering)
  const categoriesPage: IPageICommunityPlatformCategory.ISummary =
    await api.functional.communityPlatform.categories.index(connection, {
      body: {
        page: 1,
        limit: 20,
        active: true,
        sortBy: "display_order",
        direction: "asc",
      } satisfies ICommunityPlatformCategory.IRequest,
    });
  typia.assert(categoriesPage);
  TestValidator.predicate(
    "at least one active category exists",
    categoriesPage.data.length > 0,
  );
  const category: ICommunityPlatformCategory.ISummary = categoriesPage.data[0]!;

  // Helper: generate a community name satisfying PRD constraints
  const generateCommunityName = (): string => {
    const head = RandomGenerator.alphabets(1); // starts with a letter
    const middle = RandomGenerator.alphaNumeric(8); // body
    const tail = RandomGenerator.pick([
      ..."abcdefghijklmnopqrstuvwxyz0123456789",
    ]);
    const name = `${head}${middle}${tail}`; // ends with alphanumeric
    // Ensure length between 3 and 32 (ours is 10)
    return name;
  };

  // 3) Create a community
  const communityBody = {
    name: generateCommunityName(),
    community_platform_category_id: category.id,
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community: ICommunityPlatformCommunity =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      { body: communityBody },
    );
  typia.assert(community);

  // 4) Create a post in the community
  const postBody = {
    title: RandomGenerator.paragraph({ sentences: 6, wordMin: 3, wordMax: 8 }),
    body: RandomGenerator.content({
      paragraphs: 2,
      sentenceMin: 8,
      sentenceMax: 15,
      wordMin: 3,
      wordMax: 8,
    }),
    author_display_name: RandomGenerator.name(1),
  } satisfies ICommunityPlatformPost.ICreate;
  const created: ICommunityPlatformPost =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      { communityId: community.id, body: postBody },
    );
  typia.assert(created);

  // 5) Public read without authentication headers
  const publicConn: api.IConnection = { ...connection, headers: {} };
  const read: ICommunityPlatformPost =
    await api.functional.communityPlatform.posts.at(publicConn, {
      postId: created.id,
    });
  typia.assert(read);

  // Business validations
  TestValidator.equals("post id matches", read.id, created.id);
  TestValidator.equals(
    "post belongs to the created community",
    read.community_platform_community_id,
    community.id,
  );
  TestValidator.equals("title is preserved", read.title, postBody.title);
  TestValidator.equals("body is preserved", read.body, postBody.body);
  TestValidator.predicate(
    "post is active (not deleted)",
    read.deleted_at === null || read.deleted_at === undefined,
  );
  if (read.author_user_id !== null && read.author_user_id !== undefined) {
    TestValidator.equals(
      "author linkage matches joined member",
      read.author_user_id,
      auth.id,
    );
  } else {
    TestValidator.predicate(
      "author may be anonymized (null/undefined)",
      read.author_user_id === null || read.author_user_id === undefined,
    );
  }
}
