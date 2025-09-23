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

export async function test_api_post_creation_in_community_validation_errors(
  connection: api.IConnection,
) {
  // 1) Authenticate as a community member
  const joinBody = {
    username: `user_${RandomGenerator.alphaNumeric(8)}`,
    email: typia.random<string & tags.Format<"email">>(),
    password: `${RandomGenerator.alphaNumeric(10)}A!`, // >= 8 chars
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const auth: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(connection, {
      body: joinBody,
    });
  typia.assert(auth);

  // 2) Retrieve a category (prefer active)
  const catReqActive = {
    page: 1,
    limit: 5,
    active: true,
    sortBy: "display_order" as IECategorySortBy,
    direction: "asc" as IESortDirection,
  } satisfies ICommunityPlatformCategory.IRequest;
  const catPageActive = await api.functional.communityPlatform.categories.index(
    connection,
    { body: catReqActive },
  );
  typia.assert(catPageActive);

  let category: ICommunityPlatformCategory.ISummary | undefined =
    catPageActive.data[0];
  if (!category) {
    const catReqAny = {
      page: 1,
      limit: 1,
    } satisfies ICommunityPlatformCategory.IRequest;
    const catPageAny = await api.functional.communityPlatform.categories.index(
      connection,
      { body: catReqAny },
    );
    typia.assert(catPageAny);
    category = catPageAny.data[0];
  }
  TestValidator.predicate(
    "a category must exist to create a community",
    !!category,
  );
  typia.assertGuard(category!);

  // 3) Create a community
  const communityBody = {
    name: `c${RandomGenerator.alphaNumeric(10)}`,
    community_platform_category_id: category.id,
    description: RandomGenerator.paragraph({ sentences: 8 }),
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community: ICommunityPlatformCommunity =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      { body: communityBody },
    );
  typia.assert(community);

  // Baseline valid values for posts
  const validTitle = RandomGenerator.paragraph({ sentences: 5 }); // 5+ words, within <=120 chars typically
  const validBody = RandomGenerator.content({
    paragraphs: 1,
    sentenceMin: 10,
    sentenceMax: 20,
    wordMin: 4,
    wordMax: 8,
  }); // multi-line text, > 10 chars

  // 4-a) Title too short (3 chars)
  const shortTitle = RandomGenerator.alphabets(3);
  await TestValidator.error(
    "post creation fails when title is shorter than 5 characters",
    async () => {
      await api.functional.communityPlatform.communityMember.communities.posts.create(
        connection,
        {
          communityId: community.id,
          body: {
            title: shortTitle,
            body: validBody,
          } satisfies ICommunityPlatformPost.ICreate,
        },
      );
    },
  );

  // 4-b) Body too short (5 chars)
  const shortBody = RandomGenerator.alphabets(5);
  await TestValidator.error(
    "post creation fails when body is shorter than 10 characters",
    async () => {
      await api.functional.communityPlatform.communityMember.communities.posts.create(
        connection,
        {
          communityId: community.id,
          body: {
            title: validTitle,
            body: shortBody,
          } satisfies ICommunityPlatformPost.ICreate,
        },
      );
    },
  );

  // 4-c) author_display_name longer than 32 chars (e.g., 34 chars)
  const longDisplayName = RandomGenerator.alphabets(34);
  await TestValidator.error(
    "post creation fails when author_display_name exceeds 32 characters",
    async () => {
      await api.functional.communityPlatform.communityMember.communities.posts.create(
        connection,
        {
          communityId: community.id,
          body: {
            title: validTitle,
            body: validBody,
            author_display_name: longDisplayName,
          } satisfies ICommunityPlatformPost.ICreate,
        },
      );
    },
  );
}
