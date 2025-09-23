import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ICommunityPlatformComment } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformComment";
import type { IECommunityPlatformCommentSort } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformCommentSort";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformComment } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformComment";

/**
 * Validate minimum query length handling for public comment search.
 *
 * Purpose
 *
 * - Ensure that the public comment search endpoint rejects too-short queries
 *   (length < 2) with a validation-style error.
 * - Confirm that a valid-length query (>= 2) succeeds and returns a typed page of
 *   comment summaries.
 * - Verify endpoint is publicly accessible by using a clean connection without
 *   any authentication headers.
 *
 * Notes
 *
 * - DTO shape: ICommunityPlatformComment.IRequest with optional `query` but with
 *   MinLength<2> constraint when present.
 * - We DO NOT validate status codes or error messages; only that an error is
 *   thrown for invalid inputs using TestValidator.error.
 * - We intentionally do not test the "missing query" case because `query` is
 *   optional by DTO and would not necessarily be an error.
 *
 * Steps
 *
 * 1. Build public connection (no headers)
 * 2. Call PATCH /communityPlatform/search/comments with query length 1 → error
 * 3. Call PATCH /communityPlatform/search/comments with query length 0 → error
 * 4. Call PATCH /communityPlatform/search/comments with query length 2 → success
 */
export async function test_api_comment_search_min_query_length_validation(
  connection: api.IConnection,
) {
  // Create a clean, unauthenticated connection (public endpoint)
  const publicConn: api.IConnection = { ...connection, headers: {} };

  // 1) Too-short query: length 1
  await TestValidator.error(
    "reject query length 1 ('a') with validation error",
    async () => {
      const body = {
        query: "a",
      } satisfies ICommunityPlatformComment.IRequest;
      await api.functional.communityPlatform.search.comments.index(publicConn, {
        body,
      });
    },
  );

  // 2) Too-short query: length 0 (empty string)
  await TestValidator.error(
    "reject empty query '' (length 0) with validation error",
    async () => {
      const body = {
        query: "",
      } satisfies ICommunityPlatformComment.IRequest;
      await api.functional.communityPlatform.search.comments.index(publicConn, {
        body,
      });
    },
  );

  // 3) Valid query: length 2 (success path)
  const limitValue = 5 satisfies number as number; // robust against strict tag intersections
  const validBody = {
    query: "ab",
    limit: limitValue,
  } satisfies ICommunityPlatformComment.IRequest;
  const page = await api.functional.communityPlatform.search.comments.index(
    publicConn,
    { body: validBody },
  );
  typia.assert(page);
}
