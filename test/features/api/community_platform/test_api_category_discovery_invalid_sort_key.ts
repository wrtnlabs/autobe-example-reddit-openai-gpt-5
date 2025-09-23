import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ICommunityPlatformCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCategory";
import type { IECategorySortBy } from "@ORGANIZATION/PROJECT-api/lib/structures/IECategorySortBy";
import type { IESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IESortDirection";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformCategory";

/**
 * Validate category discovery input validation with a safe scenario rewrite.
 *
 * Original intent: ensure endpoint rejects unsupported sort fields. However,
 * the request DTO uses a strongly typed enum (IECategorySortBy), which makes
 * sending an invalid sort key impossible without violating TypeScript typing.
 * Therefore, exercising our autonomous scenario correction authority, this test
 * validates equivalent input validation by using out-of-range pagination
 * parameters, which must also be rejected by the endpoint.
 *
 * Steps:
 *
 * 1. Baseline success: call with a valid combination { limit: 5, sortBy:
 *    "created_at", direction: "asc" }
 *
 *    - Assert response type
 *    - Assert pagination.limit echoes the request
 *    - Assert data length does not exceed limit
 * 2. Error case: page=0 (violates Minimum<1>)
 * 3. Error case: limit=0 (violates Minimum<1>)
 */
export async function test_api_category_discovery_invalid_sort_key(
  connection: api.IConnection,
) {
  // 1) Baseline success with valid parameters
  const ok = await api.functional.communityPlatform.categories.index(
    connection,
    {
      body: {
        limit: 5,
        sortBy: "created_at",
        direction: "asc",
      } satisfies ICommunityPlatformCategory.IRequest,
    },
  );
  typia.assert(ok);

  // pagination.limit should echo the requested limit
  TestValidator.equals(
    "pagination.limit echoes requested limit (5)",
    ok.pagination.limit,
    5,
  );
  // data length should not exceed limit
  TestValidator.predicate(
    "data length should not exceed requested limit",
    ok.data.length <= ok.pagination.limit,
  );

  // 2) Error case: page=0 (violates Minimum<1>)
  await TestValidator.error(
    "reject page=0 due to Minimum<1> constraint",
    async () => {
      await api.functional.communityPlatform.categories.index(connection, {
        body: {
          page: 0,
        } satisfies ICommunityPlatformCategory.IRequest,
      });
    },
  );

  // 3) Error case: limit=0 (violates Minimum<1>)
  await TestValidator.error(
    "reject limit=0 due to Minimum<1> constraint",
    async () => {
      await api.functional.communityPlatform.categories.index(connection, {
        body: {
          limit: 0,
        } satisfies ICommunityPlatformCategory.IRequest,
      });
    },
  );
}
