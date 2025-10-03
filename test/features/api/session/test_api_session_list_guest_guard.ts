import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ICommunityPlatformSession } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSession";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformSession } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformSession";

/**
 * Guest guard for session listing.
 *
 * Purpose: verify that a guest (unauthenticated user) cannot list their
 * sessions via GET /communityPlatform/registeredMember/me/sessions and that the
 * server rejects the request without leaking any session data.
 *
 * Steps
 *
 * 1. Create an unauthenticated connection by cloning the provided connection and
 *    setting an empty headers object. Do not mutate headers thereafter.
 * 2. Call the sessions index endpoint with the unauthenticated connection.
 * 3. Expect an error to be thrown (authorization required). Do not assert HTTP
 *    status codes or error messages; only assert that an error occurs.
 */
export async function test_api_session_list_guest_guard(
  connection: api.IConnection,
) {
  // 1) Prepare unauthenticated connection (guest state)
  const unauthConn: api.IConnection = { ...connection, headers: {} };

  // 2) Attempt to access protected endpoint without authentication
  // 3) Validate that an error is thrown (no status/message checks per policy)
  await TestValidator.error(
    "guest guard blocks session listing when unauthenticated",
    async () => {
      await api.functional.communityPlatform.registeredMember.me.sessions.index(
        unauthConn,
      );
    },
  );
}
