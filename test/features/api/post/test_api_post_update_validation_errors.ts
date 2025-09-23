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
 * Validate that updating a community post rejects invalid payloads and
 * preserves original content.
 *
 * Business goal:
 *
 * - Ensure PUT /communityPlatform/communityMember/posts/{postId} enforces length
 *   constraints on title (5–120) and body (10–10,000) and that no state changes
 *   occur on rejections.
 *
 * Workflow:
 *
 * 1. Join as community member (Author A) to obtain authentication.
 * 2. List categories to discover an active category (fallback to any category when
 *    none is active).
 * 3. Create a community under the discovered category.
 * 4. Create a valid post in the community and record its original title/body.
 * 5. Attempt invalid updates in four cases and, after each failure, GET the post
 *    and assert that title/body remain unchanged.
 *
 * Notes:
 *
 * - Error checks use TestValidator.error; no status code or message validation
 *   per policy.
 * - All responses are validated with typia.assert.
 */
export async function test_api_post_update_validation_errors(
  connection: api.IConnection,
) {
  // Helper to create a valid community name (3–32 chars, starts with letter, ends with alnum, allowed [A-Za-z0-9_-])
  const buildCommunityName = (): string => {
    const first = RandomGenerator.pick([..."abcdefghijklmnopqrstuvwxyz"]);
    const middle = RandomGenerator.alphaNumeric(8); // alnum-only is valid subset of allowed pattern
    const last = RandomGenerator.pick([
      ..."abcdefghijklmnopqrstuvwxyz0123456789",
    ]);
    return `${first}${middle}${last}`; // length 10, satisfies pattern
  };

  // 1) Join as community member (Author A)
  const authorized: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(connection, {
      body: {
        username: `user_${RandomGenerator.alphaNumeric(8)}`,
        email: typia.random<string & tags.Format<"email">>(),
        password: RandomGenerator.alphabets(12),
      } satisfies ICommunityPlatformCommunityMember.ICreate,
    });
  typia.assert(authorized);

  // 2) Discover an active category (fallback to any when empty)
  const firstPage = await api.functional.communityPlatform.categories.index(
    connection,
    {
      body: {
        active: true,
        limit: 20 satisfies number as number,
      } satisfies ICommunityPlatformCategory.IRequest,
    },
  );
  typia.assert(firstPage);
  let category = firstPage.data.find((c) => c.active === true);
  if (!category) {
    const anyPage = await api.functional.communityPlatform.categories.index(
      connection,
      {
        body: {} satisfies ICommunityPlatformCategory.IRequest,
      },
    );
    typia.assert(anyPage);
    category = anyPage.data[0];
  }
  typia.assertGuard(category!);

  // 3) Create a community
  const community =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      {
        body: {
          name: buildCommunityName(),
          community_platform_category_id: category!.id,
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);

  // 4) Create a valid post within the community
  const validTitle = `Title_${RandomGenerator.alphaNumeric(10)}`; // >= 5
  const validBody = RandomGenerator.content({
    paragraphs: 2,
    sentenceMin: 8,
    sentenceMax: 12,
    wordMin: 3,
    wordMax: 8,
  }); // reasonably > 10
  const post =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      {
        communityId: community.id,
        body: {
          title: validTitle,
          body: validBody,
        } satisfies ICommunityPlatformPost.ICreate,
      },
    );
  typia.assert(post);

  // Capture original content for non-mutation checks
  const originalTitle: string = post.title;
  const originalBody: string = post.body;

  // Utility to re-fetch and assert no mutation
  const assertUnchanged = async (caseTitle: string): Promise<void> => {
    const read = await api.functional.communityPlatform.posts.at(connection, {
      postId: post.id,
    });
    typia.assert(read);
    TestValidator.equals(
      `${caseTitle} - title unchanged`,
      read.title,
      originalTitle,
    );
    TestValidator.equals(
      `${caseTitle} - body unchanged`,
      read.body,
      originalBody,
    );
  };

  // 5-A) Invalid: title too short (< 5)
  await TestValidator.error(
    "reject update when title is shorter than 5",
    async () => {
      await api.functional.communityPlatform.communityMember.posts.update(
        connection,
        {
          postId: post.id,
          body: {
            title: "Hey", // length 3
          } satisfies ICommunityPlatformPost.IUpdate,
        },
      );
    },
  );
  await assertUnchanged("short title");

  // 5-B) Invalid: body too short (< 10)
  await TestValidator.error(
    "reject update when body is shorter than 10",
    async () => {
      await api.functional.communityPlatform.communityMember.posts.update(
        connection,
        {
          postId: post.id,
          body: {
            body: "TooShort", // length 8
          } satisfies ICommunityPlatformPost.IUpdate,
        },
      );
    },
  );
  await assertUnchanged("short body");

  // 5-C) Invalid: title too long (> 120)
  const tooLongTitle = "T".repeat(121);
  await TestValidator.error(
    "reject update when title exceeds 120 chars",
    async () => {
      await api.functional.communityPlatform.communityMember.posts.update(
        connection,
        {
          postId: post.id,
          body: {
            title: tooLongTitle,
          } satisfies ICommunityPlatformPost.IUpdate,
        },
      );
    },
  );
  await assertUnchanged("long title");

  // 5-D) Invalid: body too long (> 10,000)
  const tooLongBody = "x".repeat(10001);
  await TestValidator.error(
    "reject update when body exceeds 10,000 chars",
    async () => {
      await api.functional.communityPlatform.communityMember.posts.update(
        connection,
        {
          postId: post.id,
          body: {
            body: tooLongBody,
          } satisfies ICommunityPlatformPost.IUpdate,
        },
      );
    },
  );
  await assertUnchanged("long body");
}
