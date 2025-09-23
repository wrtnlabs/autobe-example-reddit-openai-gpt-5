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
 * Fetch a specific post snapshot by historyId and verify it reflects the exact
 * point-in-time state.
 *
 * Business flow:
 *
 * 1. Register (join) a community member to obtain authenticated context.
 * 2. Discover an active category to use for community creation.
 * 3. Create a community under the discovered category.
 * 4. Create an initial post (capture original title/body/display name).
 * 5. Perform two updates to generate snapshots (each edit appends a snapshot of
 *    the previous state).
 * 6. List snapshots and select one that matches a known historical state (prefer
 *    first-edit state).
 * 7. Fetch snapshot detail by historyId and validate ownership and content
 *    equality.
 */
export async function test_api_post_history_detail_fetch_specific_snapshot(
  connection: api.IConnection,
) {
  // 1) Join as community member (User A)
  const member = await api.functional.auth.communityMember.join(connection, {
    body: {
      username: `user_${RandomGenerator.alphaNumeric(8)}`,
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ICommunityPlatformCommunityMember.ICreate,
  });
  typia.assert(member);

  // 2) List categories to obtain an active category id
  const categoriesPage =
    await api.functional.communityPlatform.categories.index(connection, {
      body: {
        active: true,
      } satisfies ICommunityPlatformCategory.IRequest,
    });
  typia.assert(categoriesPage);
  TestValidator.predicate(
    "at least one active category must exist for community creation",
    categoriesPage.data.length > 0,
  );
  const category = categoriesPage.data[0];

  // 3) Create a community
  const communityName = `${RandomGenerator.alphabets(1)}${RandomGenerator.alphaNumeric(6)}`; // starts with letter, 7 chars total
  const community =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      {
        body: {
          name: communityName,
          community_platform_category_id: category.id,
          description: RandomGenerator.paragraph({ sentences: 8 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);

  // 4) Create initial post
  const originalTitle = RandomGenerator.paragraph({ sentences: 5 });
  const originalBody = RandomGenerator.content({ paragraphs: 2 });
  const originalDisplay = RandomGenerator.name(1);
  const post =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      {
        communityId: community.id,
        body: {
          title: originalTitle,
          body: originalBody,
          author_display_name: originalDisplay,
        } satisfies ICommunityPlatformPost.ICreate,
      },
    );
  typia.assert(post);

  // 5) Perform two updates to produce snapshots
  const edit1Title = `${RandomGenerator.paragraph({ sentences: 6 })}`;
  const edit1Body = RandomGenerator.content({ paragraphs: 3 });
  const edit1Display = RandomGenerator.name(1);
  const afterEdit1 =
    await api.functional.communityPlatform.communityMember.posts.update(
      connection,
      {
        postId: post.id,
        body: {
          title: edit1Title,
          body: edit1Body,
          author_display_name: edit1Display,
        } satisfies ICommunityPlatformPost.IUpdate,
      },
    );
  typia.assert(afterEdit1);

  const edit2Title = `${RandomGenerator.paragraph({ sentences: 7 })}`;
  const edit2Body = RandomGenerator.content({ paragraphs: 2 });
  // switch display name to null to ensure variety in snapshot content
  const edit2Display: string | null = null;
  const afterEdit2 =
    await api.functional.communityPlatform.communityMember.posts.update(
      connection,
      {
        postId: post.id,
        body: {
          title: edit2Title,
          body: edit2Body,
          author_display_name: edit2Display,
        } satisfies ICommunityPlatformPost.IUpdate,
      },
    );
  typia.assert(afterEdit2);

  // 6) List snapshots (prefer newest-first ordering)
  const historyPage =
    await api.functional.communityPlatform.posts.history.index(connection, {
      postId: post.id,
      body: {
        orderBy: "created_at",
        direction: "desc",
      } satisfies ICommunityPlatformPostSnapshot.IRequest,
    });
  typia.assert(historyPage);
  TestValidator.predicate(
    "snapshot history must contain at least one record after edits",
    historyPage.data.length > 0,
  );

  // Try to find a snapshot that matches the first edit's state
  const matchEdit1 = historyPage.data.find(
    (s) =>
      s.title === edit1Title &&
      s.body === edit1Body &&
      (s.author_display_name ?? null) === (edit1Display ?? null),
  );
  // Fallback: try to find the original state snapshot
  const matchOriginal = historyPage.data.find(
    (s) =>
      s.title === originalTitle &&
      s.body === originalBody &&
      (s.author_display_name ?? null) === (originalDisplay ?? null),
  );
  const selectedFromList = matchEdit1 ?? matchOriginal ?? historyPage.data[0];

  // Expected state to compare with (prefer edit1, else original, else list item itself)
  const expectedTitle = matchEdit1
    ? edit1Title
    : matchOriginal
      ? originalTitle
      : selectedFromList.title;
  const expectedBody = matchEdit1
    ? edit1Body
    : matchOriginal
      ? originalBody
      : selectedFromList.body;
  const expectedDisplay = matchEdit1
    ? edit1Display
    : matchOriginal
      ? originalDisplay
      : (selectedFromList.author_display_name ?? null);

  // 7) Fetch detail by historyId and validate
  const detail = await api.functional.communityPlatform.posts.history.at(
    connection,
    {
      postId: post.id,
      historyId: selectedFromList.id,
    },
  );
  typia.assert(detail);

  // Ownership and identity checks
  TestValidator.equals(
    "detail snapshot id equals the selected history id",
    detail.id,
    selectedFromList.id,
  );
  TestValidator.equals(
    "snapshot belongs to the source post",
    detail.community_platform_post_id,
    post.id,
  );

  // Historical content equality checks
  TestValidator.equals(
    "snapshot.title equals the expected historical title",
    detail.title,
    expectedTitle,
  );
  TestValidator.equals(
    "snapshot.body equals the expected historical body",
    detail.body,
    expectedBody,
  );
  TestValidator.equals(
    "snapshot.author_display_name equals the expected historical display name (nullable)",
    detail.author_display_name ?? null,
    expectedDisplay,
  );
}
