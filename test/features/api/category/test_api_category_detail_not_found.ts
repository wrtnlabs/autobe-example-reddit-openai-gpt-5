import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ICommunityPlatformCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCategory";

export async function test_api_category_detail_not_found(
  connection: api.IConnection,
) {
  /**
   * Ensure GET /communityPlatform/categories/{categoryId} rejects when the UUID
   * is well-formed but does not correspond to an existing (or soft-deleted)
   * category.
   *
   * Per policy, only validate that an error occurs; do not assert HTTP status
   * codes or error message content.
   */
  const nonExistentId = "00000000-0000-0000-0000-000000000000";

  await TestValidator.error(
    "non-existent category id should cause an error",
    async () => {
      await api.functional.communityPlatform.categories.at(connection, {
        categoryId: nonExistentId,
      });
    },
  );
}
