import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ICommunityPlatformCommentSnapshot } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommentSnapshot";
import type { IECommentSnapshotOrderBy } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommentSnapshotOrderBy";
import type { IEOrderDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IEOrderDirection";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformCommentSnapshot } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformCommentSnapshot";

/**
 * Negative-path: request comment history for a non-existent comment.
 *
 * Purpose
 *
 * - Verify PATCH /communityPlatform/comments/{commentId}/history rejects a
 *   well-typed request when the commentId does not exist. We expect an error,
 *   but do not assert a specific HTTP status per policy.
 * - Ensure request body strictly conforms to
 *   ICommunityPlatformCommentSnapshot.IRequest.
 *
 * Simulator compatibility
 *
 * - If connection.simulate === true, the SDK returns random data without backend
 *   access. In that case, perform a normal call and validate the response type
 *   using typia.assert.
 * - Otherwise (real backend), assert that an error occurs.
 *
 * Steps
 *
 * 1. Prepare a well-formed, non-existent UUID (all-zero UUID) for commentId.
 * 2. Build a valid IRequest body (page=1, limit=20, orderBy=created_at,
 *    direction=desc).
 * 3. If simulate: call and typia.assert the response.
 * 4. Else: expect an error using await TestValidator.error.
 */
export async function test_api_comment_history_invalid_comment_id_not_found(
  connection: api.IConnection,
) {
  const nonExistentId = typia.assert<string & tags.Format<"uuid">>(
    "00000000-0000-0000-0000-000000000000",
  );

  const requestBody = {
    page: 1,
    limit: 20,
    orderBy: "created_at",
    direction: "desc",
  } satisfies ICommunityPlatformCommentSnapshot.IRequest;

  if (connection.simulate === true) {
    // Simulator returns random data; just validate response type
    const page = await api.functional.communityPlatform.comments.history.index(
      connection,
      {
        commentId: typia.random<string & tags.Format<"uuid">>(),
        body: requestBody,
      },
    );
    typia.assert(page);
  } else {
    await TestValidator.error(
      "history listing should error for non-existent comment",
      async () => {
        await api.functional.communityPlatform.comments.history.index(
          connection,
          {
            commentId: nonExistentId,
            body: requestBody,
          },
        );
      },
    );
  }
}
