import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ICommunityPlatformCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCategory";

/**
 * Validate category detail retrieval with policy-compliant scenarios.
 *
 * Original request: verify invalid UUID path parameter handling (expect 400).
 * Policy rewrite: Type/format error testing is prohibited and the path param is
 * strongly typed as string & tags.Format<"uuid">. Therefore, we implement:
 *
 * 1. Contract validation (simulation mode):
 *
 *    - Build a simulated connection from the given one
 *    - Call GET /communityPlatform/categories/{categoryId} with a valid UUID
 *    - Assert the response strictly matches ICommunityPlatformCategory
 * 2. Negative path (only when not simulating):
 *
 *    - Call the same endpoint with a random, valid UUID that is unlikely to exist
 *         and assert that an error occurs
 *    - Do not assert specific HTTP status codes or messages
 */
export async function test_api_category_detail_invalid_id_format(
  connection: api.IConnection,
) {
  // 1) Contract validation in simulation mode (deterministic success)
  const simConn: api.IConnection = { ...connection, simulate: true };
  const simulated: ICommunityPlatformCategory =
    await api.functional.communityPlatform.categories.at(simConn, {
      categoryId: typia.random<string & tags.Format<"uuid">>(),
    });
  typia.assert(simulated);

  // 2) Negative path only in a real (non-simulated) environment
  if (connection.simulate !== true) {
    const nonexistentCategoryId: string & tags.Format<"uuid"> = typia.random<
      string & tags.Format<"uuid">
    >();

    await TestValidator.error(
      "requesting a non-existent category should raise an error",
      async () => {
        await api.functional.communityPlatform.categories.at(connection, {
          categoryId: nonexistentCategoryId,
        });
      },
    );
  }
}
