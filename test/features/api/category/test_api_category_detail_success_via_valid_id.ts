import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ICommunityPlatformCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCategory";
import type { IECategorySortBy } from "@ORGANIZATION/PROJECT-api/lib/structures/IECategorySortBy";
import type { IESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IESortDirection";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformCategory";

export async function test_api_category_detail_success_via_valid_id(
  connection: api.IConnection,
) {
  /** 1. Discover a valid category via listing (broad filter, deterministic order) */
  const page = await api.functional.communityPlatform.categories.index(
    connection,
    {
      body: {
        page: 1,
        limit: 20,
        search: null,
        active: null,
        sortBy: "display_order",
        direction: "asc",
        created_from: null,
        created_to: null,
      } satisfies ICommunityPlatformCategory.IRequest,
    },
  );
  typia.assert(page);

  // Ensure we have at least one category to test detail retrieval
  TestValidator.predicate(
    "listing should return at least one category",
    page.data.length > 0,
  );

  const summary = page.data[0];

  /** 2. Fetch detail using the discovered valid id */
  const detail = await api.functional.communityPlatform.categories.at(
    connection,
    { categoryId: summary.id },
  );
  typia.assert(detail);

  /** 3. Validate field consistency between summary and detail */
  TestValidator.equals("detail.id equals summary.id", detail.id, summary.id);
  TestValidator.equals(
    "detail.code equals summary.code",
    detail.code,
    summary.code,
  );
  TestValidator.equals(
    "detail.name equals summary.name",
    detail.name,
    summary.name,
  );
  TestValidator.equals(
    "detail.display_order equals summary.display_order",
    detail.display_order,
    summary.display_order,
  );
  TestValidator.equals(
    "detail.active equals summary.active",
    detail.active,
    summary.active,
  );
  TestValidator.equals(
    "detail.created_at equals summary.created_at",
    detail.created_at,
    summary.created_at,
  );

  /** Business rule: public endpoints must not return soft-deleted records */
  TestValidator.predicate(
    "detail should not be soft-deleted",
    detail.deleted_at === null || detail.deleted_at === undefined,
  );
}
