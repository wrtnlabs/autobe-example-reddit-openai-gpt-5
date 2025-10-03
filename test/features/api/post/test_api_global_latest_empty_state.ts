import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";
import type { ICommunityPlatformPost } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformPost";

/**
 * Validate Global Latest endpoint is public, returns fixed-size 10 items, and
 * enforces Newest ordering.
 *
 * Business context:
 *
 * - "/communityPlatform/posts/globalLatest" is a public read endpoint used for
 *   the Home sidebar module. It must not require authentication.
 * - Contract guarantees a fixed-size list of exactly 10 newest posts, ordered by
 *   createdAt DESC with id DESC tie-breaker, represented by IPostMini items.
 *
 * Test steps:
 *
 * 1. Create an unauthenticated (guest) connection by cloning input connection with
 *    empty headers.
 * 2. Call GET /communityPlatform/posts/globalLatest.
 * 3. Validate response type with typia.assert (covers full schema including nested
 *    ICommunityPlatformCommunity.IRef).
 * 4. Assert business rules:
 *
 *    - Data length is exactly 10
 *    - CreatedAt is monotonic non-increasing (DESC)
 *    - When createdAt ties, id is strictly non-increasing (DESC)
 */
export async function test_api_global_latest_empty_state(
  connection: api.IConnection,
) {
  // 1) Unauthenticated access (public endpoint)
  const guest: api.IConnection = { ...connection, headers: {} };

  // 2) Call endpoint
  const output =
    await api.functional.communityPlatform.posts.globalLatest.index(guest);

  // 3) Type validation (complete schema check)
  typia.assert(output);

  // 4-1) Fixed-size list: exactly 10 items
  TestValidator.equals(
    "global latest returns exactly 10 items",
    output.data.length,
    10,
  );

  // 4-2) Newest ordering: createdAt DESC
  TestValidator.predicate(
    "createdAt is sorted in non-increasing order (DESC)",
    () =>
      output.data.every((curr, i, arr) =>
        i === 0
          ? true
          : Date.parse(arr[i - 1].createdAt) >= Date.parse(curr.createdAt),
      ),
  );

  // 4-3) Tie-breaker: id DESC when createdAt equal
  TestValidator.predicate("id is DESC when createdAt ties", () =>
    output.data.every((curr, i, arr) =>
      i === 0
        ? true
        : Date.parse(arr[i - 1].createdAt) > Date.parse(curr.createdAt) ||
          (arr[i - 1].createdAt === curr.createdAt && arr[i - 1].id >= curr.id),
    ),
  );
}
