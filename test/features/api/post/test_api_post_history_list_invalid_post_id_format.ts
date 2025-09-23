import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ICommunityPlatformPostSnapshot } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformPostSnapshot";
import type { IEOrderDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IEOrderDirection";
import type { IEPostSnapshotOrderBy } from "@ORGANIZATION/PROJECT-api/lib/structures/IEPostSnapshotOrderBy";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformPostSnapshot } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformPostSnapshot";

/**
 * List post snapshots: success path and invalid pagination constraints.
 *
 * Original ask was to verify rejection of non-UUID `postId`, but that is
 * impossible to implement within strict TypeScript typing (SDK requires `string
 * & tags.Format<"uuid">`). Instead, we validate two scenarios:
 *
 * 1. Success: List snapshots with a valid UUID and well-formed request body
 *    (pagination, sorting, optional date range). Response must match
 *    `IPageICommunityPlatformPostSnapshot`.
 * 2. Failure: Send an out-of-range `limit` (0) which violates `tags.Minimum<1>` to
 *    confirm runtime validation rejects invalid values while maintaining
 *    correct types.
 *
 * Notes:
 *
 * - Uses simulation mode for deterministic results without relying on data
 *   presence. No authentication required per endpoint description.
 * - Does not assert specific HTTP status codes; only that an error occurs.
 */
export async function test_api_post_history_list_invalid_post_id_format(
  connection: api.IConnection,
) {
  // Prepare a simulated connection for deterministic behavior
  const simulated: api.IConnection = { ...connection, simulate: true };

  // Valid path param: must be a UUID string per SDK typing
  const postId = typia.random<string & tags.Format<"uuid">>();

  // Build a valid request body within constraints
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const validBody = {
    page: 1,
    limit: 10,
    orderBy: "created_at",
    direction: "desc",
    created_from: sevenDaysAgo.toISOString(),
    created_to: now.toISOString(),
  } satisfies ICommunityPlatformPostSnapshot.IRequest;

  // 1) Success: list snapshots with valid inputs
  const page = await api.functional.communityPlatform.posts.history.index(
    simulated,
    {
      postId,
      body: validBody,
    },
  );
  typia.assert(page);

  // 2) Failure: out-of-range limit (violates Minimum<1>)
  const invalidBodyLimitZero = {
    ...validBody,
    limit: 0, // still a number type; violates runtime constraint Minimum<1>
  } satisfies ICommunityPlatformPostSnapshot.IRequest;

  await TestValidator.error(
    "rejects request when limit=0 (below minimum)",
    async () => {
      await api.functional.communityPlatform.posts.history.index(simulated, {
        postId,
        body: invalidBodyLimitZero,
      });
    },
  );
}
