import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";

export async function test_api_community_membership_leave_unauthenticated_guard(
  connection: api.IConnection,
) {
  /**
   * Guest guard: attempt to leave a community without authentication.
   *
   * Purpose
   *
   * - Verify that the membership leave endpoint enforces authentication.
   * - When called without an authenticated session, the API must reject the
   *   request.
   *
   * Steps
   *
   * 1. Build an unauthenticated connection from the provided connection (headers
   *    replaced with empty object; never manipulate afterwards).
   * 2. Generate a plausible community name.
   * 3. Call the erase endpoint and expect it to throw (unauthorized).
   *
   * Notes
   *
   * - Do NOT assert specific HTTP status codes or error messages.
   * - The endpoint returns void on success; here we only validate the guard path.
   */
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  const communityName: string = `comm_${RandomGenerator.alphaNumeric(12)}`;

  await TestValidator.error(
    "guest cannot leave membership without authentication",
    async () => {
      await api.functional.communityPlatform.registeredMember.communities.membership.erase(
        unauthConn,
        { communityName },
      );
    },
  );
}
