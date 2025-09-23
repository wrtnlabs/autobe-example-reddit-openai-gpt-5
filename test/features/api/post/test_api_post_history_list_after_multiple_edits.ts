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

export async function test_api_post_history_list_after_multiple_edits(
  connection: api.IConnection,
) {
  // 1) Authenticate a new community member (User A)
  const joinBody = {
    username: RandomGenerator.name(1),
    email: typia.random<string & tags.Format<"email">>(),
    password: `P@ssw0rd_${RandomGenerator.alphaNumeric(8)}`,
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const authorized = await api.functional.auth.communityMember.join(
    connection,
    {
      body: joinBody,
    },
  );
  typia.assert(authorized);

  // 2) Discover an active category
  const categoriesPage =
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
  await TestValidator.predicate(
    "at least one active category exists",
    categoriesPage.data.length > 0,
  );
  const category = typia.assert<ICommunityPlatformCategory.ISummary>(
    categoriesPage.data[0],
  );

  // 3) Create a community
  const communityName = (() => {
    // Must match ^[A-Za-z][A-Za-z0-9_-]{1,30}[A-Za-z0-9]$
    const head = RandomGenerator.alphabets(1).toUpperCase();
    const middle = RandomGenerator.alphaNumeric(6).replace(/[^a-z0-9]/g, "a");
    const tail = RandomGenerator.alphaNumeric(1).replace(/[^a-z0-9]/g, "0");
    return `${head}${middle}${tail}`;
  })();
  const community =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      {
        body: {
          name: communityName,
          community_platform_category_id: category.id,
          description: RandomGenerator.paragraph({ sentences: 6 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);

  // 4) Create a post in the community
  const createPostBody = {
    title: `Initial ${RandomGenerator.paragraph({ sentences: 3 })}`.slice(
      0,
      120,
    ),
    body: RandomGenerator.paragraph({ sentences: 20 }),
    author_display_name: RandomGenerator.name(1),
  } satisfies ICommunityPlatformPost.ICreate;
  const post =
    await api.functional.communityPlatform.communityMember.communities.posts.create(
      connection,
      {
        communityId: postCommunityId(community.id),
        body: createPostBody,
      },
    );
  typia.assert(post);

  // 5) Baseline history before edits
  const page1 = 1;
  const limit = 200; // large enough to include edits
  const baselineHistory =
    await api.functional.communityPlatform.posts.history.index(connection, {
      postId: post.id,
      body: {
        page: page1,
        limit,
        orderBy: "created_at",
        direction: "desc",
      } satisfies ICommunityPlatformPostSnapshot.IRequest,
    });
  typia.assert(baselineHistory);
  const baselineCount = baselineHistory.data.length;

  // 6) Perform multiple edits to generate snapshots
  const edits = 3;
  for (let i = 1; i <= edits; ++i) {
    const shortToken = RandomGenerator.alphaNumeric(6);
    const updateBody = {
      title: `Edited#${i}-${shortToken}`.slice(0, 120),
      body: RandomGenerator.paragraph({ sentences: 24 }),
    } satisfies ICommunityPlatformPost.IUpdate;
    const updated =
      await api.functional.communityPlatform.communityMember.posts.update(
        connection,
        {
          postId: post.id,
          body: updateBody,
        },
      );
    typia.assert(updated);
  }

  // 7) Read history again
  const history = await api.functional.communityPlatform.posts.history.index(
    connection,
    {
      postId: post.id,
      body: {
        page: page1,
        limit,
        orderBy: "created_at",
        direction: "desc",
      } satisfies ICommunityPlatformPostSnapshot.IRequest,
    },
  );
  typia.assert(history);

  // Validations
  // 7.1) Count increased by at least number of edits
  await TestValidator.predicate(
    "snapshot count increased by at least the number of edits",
    history.data.length >= baselineCount + edits,
  );

  // 7.2) All snapshots belong to the target post
  for (let i = 0; i < history.data.length; ++i) {
    const s = history.data[i];
    TestValidator.equals(
      `snapshot[${i}].post id matches`,
      s.community_platform_post_id,
      post.id,
    );
  }

  // 7.3) Ordering check: created_at desc; tie-breaker id desc
  const isOrdered = (() => {
    for (let i = 1; i < history.data.length; ++i) {
      const a = history.data[i - 1];
      const b = history.data[i];
      if (a.created_at < b.created_at) return false;
      if (a.created_at === b.created_at && a.id < b.id) return false; // id desc
    }
    return true;
  })();
  await TestValidator.predicate(
    "history is ordered by created_at desc, id desc",
    isOrdered,
  );

  // 7.4) Pagination metadata matches request
  TestValidator.equals(
    "pagination.current equals requested page",
    history.pagination.current,
    page1,
  );
  TestValidator.equals(
    "pagination.limit equals requested limit",
    history.pagination.limit,
    limit,
  );

  // 7.5) Stable ordering across pages when multiple pages exist
  if (history.pagination.pages > 1) {
    const historyPage2 =
      await api.functional.communityPlatform.posts.history.index(connection, {
        postId: post.id,
        body: {
          page: page1 + 1,
          limit,
          orderBy: "created_at",
          direction: "desc",
        } satisfies ICommunityPlatformPostSnapshot.IRequest,
      });
    typia.assert(historyPage2);

    const tail1 = history.data[history.data.length - 1];
    const head2 = historyPage2.data[0];
    if (tail1 && head2) {
      const crossPageOrdered =
        tail1.created_at > head2.created_at ||
        (tail1.created_at === head2.created_at && tail1.id >= head2.id);
      await TestValidator.predicate(
        "cross-page ordering remains non-increasing",
        crossPageOrdered,
      );
    }
  }

  // Local helper to satisfy literal type for communityId path without assertions
  function postCommunityId(x: string & tags.Format<"uuid">) {
    return x;
  }
}
