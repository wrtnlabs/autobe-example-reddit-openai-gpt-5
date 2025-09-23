import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ICommunityPlatformPostSnapshot } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformPostSnapshot";
import type { IEOrderDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IEOrderDirection";
import type { IEPostSnapshotOrderBy } from "@ORGANIZATION/PROJECT-api/lib/structures/IEPostSnapshotOrderBy";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformPostSnapshot } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformPostSnapshot";

export async function test_api_post_history_list_not_found_for_nonexistent_post(
  connection: api.IConnection,
) {
  /**
   * Validate that requesting history for a non-existent post fails.
   *
   * Steps:
   *
   * 1. Generate a well-formed UUID that does not correspond to any post
   * 2. Call PATCH /communityPlatform/posts/{postId}/history with valid listing
   *    parameters
   * 3. Assert that the operation throws an error (no HTTP status code checks)
   */

  // 1) Generate a well-formed UUID for a non-existent post
  const nonExistentPostId: string & tags.Format<"uuid"> = typia.random<
    string & tags.Format<"uuid">
  >();

  // 2) Prepare valid listing parameters (all fields optional, choose reasonable values)
  const requestBody = {
    page: 1,
    limit: 20,
    orderBy: "created_at",
    direction: "desc",
  } satisfies ICommunityPlatformPostSnapshot.IRequest;

  // 3) Call the API and require an error
  await TestValidator.error(
    "listing history for a non-existent post must throw error",
    async () => {
      await api.functional.communityPlatform.posts.history.index(connection, {
        postId: nonExistentPostId,
        body: requestBody,
      });
    },
  );
}
