import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ICommunityPlatformPost } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformPost";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformPost } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformPost";

/**
 * Validate minimum-length enforcement for post search queries.
 *
 * Objective:
 *
 * - Ensure the public search endpoint rejects queries shorter than 2 characters
 *   and succeeds when the query meets the minimum length requirement.
 *
 * Steps:
 *
 * 1. Call PATCH /communityPlatform/posts with a 1-character query ("a") and expect
 *    an error.
 * 2. Call the same endpoint with an empty string ("") and expect an error.
 * 3. Call with a 2-character query ("ab") and expect success with a
 *    IPageICommunityPlatformPost.ISummary response.
 */
export async function test_api_post_search_query_min_length_validation(
  connection: api.IConnection,
) {
  // Common pagination controls for determinism
  const page = 1;
  const limit = 10;

  // 1) Negative: one-character query should be rejected
  const shortQueryBody = {
    page,
    limit,
    search: "a",
  } satisfies ICommunityPlatformPost.IRequest;
  await TestValidator.error("reject 1-character search query", async () => {
    await api.functional.communityPlatform.posts.index(connection, {
      body: shortQueryBody,
    });
  });

  // 2) Negative: empty string query should be rejected
  const emptyQueryBody = {
    page,
    limit,
    search: "",
  } satisfies ICommunityPlatformPost.IRequest;
  await TestValidator.error("reject empty-string search query", async () => {
    await api.functional.communityPlatform.posts.index(connection, {
      body: emptyQueryBody,
    });
  });

  // 3) Positive: minimum valid query (2 characters) should succeed
  const validQueryBody = {
    page,
    limit,
    search: "ab",
  } satisfies ICommunityPlatformPost.IRequest;
  const ok = await api.functional.communityPlatform.posts.index(connection, {
    body: validQueryBody,
  });
  typia.assert(ok);
}
