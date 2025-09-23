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
 * Ensure vote clearing is idempotent when no prior vote exists.
 *
 * Steps:
 *
 * 1. Join as Author A
 * 2. Discover an active category
 * 3. Create a community
 * 4. Create a post under the community
 * 5. Join as Member B (no prior vote)
 * 6. Member B clears vote twice (no errors both times)
 */
export async function test_api_post_vote_clear_idempotent_when_no_vote(
  connection: api.IConnection,
) {
  // 1) Join as Author A
  const authorEmail: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const authorUsername: string = RandomGenerator.name(1).replace(/\s+/g, "");
  const authorPassword: string = `P${RandomGenerator.alphaNumeric(11)}`; // >= 12 chars
  const author = await api.functional.auth.communityMember.join(connection, {
    body: {
      username: authorUsername,
      email: authorEmail,
      password: authorPassword,
    } satisfies ICommunityPlatformCommunityMember.ICreate,
  });
  typia.assert(author);

  // 2) Discover an active category (fallback to any category if none marked active)
  const pageActive = await api.functional.communityPlatform.categories.index(
    connection,
    {
      body: {
        active: true,
        limit: 10,
      } satisfies ICommunityPlatformCategory.IRequest,
    },
  );
  typia.assert(pageActive);
  let category = pageActive.data.find((c) => c.active) ?? pageActive.data[0];
  if (!category) {
    const pageAny = await api.functional.communityPlatform.categories.index(
      connection,
      {
        body: {
          limit: 10,
        } satisfies ICommunityPlatformCategory.IRequest,
      },
    );
    typia.assert(pageAny);
    category = pageAny.data[0];
  }
  TestValidator.predicate(
    "a category must be available for community creation",
    category !== undefined,
  );
  typia.assertGuard(category!);

  // 3) Create a community under the selected category
  const communityName = `${RandomGenerator.alphabets(1)}${RandomGenerator.alphaNumeric(
    11,
  )}`; // starts with letter, total length >= 12
  const community =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      {
        body: {
          name: communityName,
          community_platform_category_id: category!.id,
          description: RandomGenerator.paragraph({ sentences: 8 }),
          logo: null,
          banner: null,
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);
  TestValidator.equals(
    "community.category_id should match selected category",
    community.community_platform_category_id,
    category!.id,
  );

  // 4) Create a post under the community
  const post =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      {
        communityId: community.id,
        body: {
          title: RandomGenerator.paragraph({ sentences: 5 }),
          body: RandomGenerator.content({
            paragraphs: 2,
            sentenceMin: 8,
            sentenceMax: 14,
          }),
          author_display_name: RandomGenerator.name(1),
        } satisfies ICommunityPlatformPost.ICreate,
      },
    );
  typia.assert(post);
  TestValidator.equals(
    "post must belong to created community",
    post.community_platform_community_id,
    community.id,
  );

  // 5) Switch actor: join as Member B (no prior interactions)
  const memberBEmail: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const memberBUsername: string = RandomGenerator.name(1).replace(/\s+/g, "");
  const memberBPassword: string = `P${RandomGenerator.alphaNumeric(11)}`; // >= 12 chars
  const memberB = await api.functional.auth.communityMember.join(connection, {
    body: {
      username: memberBUsername,
      email: memberBEmail,
      password: memberBPassword,
    } satisfies ICommunityPlatformCommunityMember.ICreate,
  });
  typia.assert(memberB);

  // 6) Member B clears vote twice to confirm idempotency (both should succeed)
  await api.functional.communityPlatform.communityMember.posts.votes.erase(
    connection,
    { postId: post.id },
  );
  // Repeat the operation; should remain a no-op and not throw
  await api.functional.communityPlatform.communityMember.posts.votes.erase(
    connection,
    { postId: post.id },
  );
}
