import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ICommunityPlatformSession } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSession";

/**
 * Verify guest guard on session detail endpoint.
 *
 * Purpose:
 *
 * - Ensure unauthenticated users cannot access protected session detail API and
 *   that the server rejects the call without exposing session data.
 *
 * Steps:
 *
 * 1. Create an unauthenticated connection (fresh headers object) without mutating
 *    the original connection.
 * 2. Generate a random UUID for the target sessionId.
 * 3. Invoke GET /communityPlatform/registeredMember/sessions/{sessionId} with the
 *    unauthenticated connection and expect an error.
 *
 * Validation:
 *
 * - Use TestValidator.error to assert an error is thrown. Do not test specific
 *   HTTP status codes or messages.
 */
export async function test_api_session_detail_unauthenticated_guard(
  connection: api.IConnection,
) {
  // 1) Build an unauthenticated connection (allowed pattern: create empty headers)
  const unauthConn: api.IConnection = { ...connection, headers: {} };

  // 2) Random session id (UUID)
  const sessionId = typia.random<string & tags.Format<"uuid">>();

  // 3) Expect guest guard error on protected endpoint
  await TestValidator.error(
    "guest guard: unauthenticated access to session detail should fail",
    async () => {
      await api.functional.communityPlatform.registeredMember.sessions.at(
        unauthConn,
        { sessionId },
      );
    },
  );
}
