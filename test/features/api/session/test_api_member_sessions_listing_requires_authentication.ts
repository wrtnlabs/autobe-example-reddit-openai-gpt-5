import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ICommunityPlatformSession } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSession";
import type { IECommunityPlatformSessionSort } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformSessionSort";
import type { IECommunityPlatformSessionStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformSessionStatus";
import type { IEOrderDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IEOrderDirection";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformSession } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformSession";

/**
 * Sessions listing requires authentication (guest guard).
 *
 * Purpose:
 *
 * - Ensure that listing authentication sessions is protected and rejects
 *   unauthenticated callers.
 *
 * Scope:
 *
 * - Call PATCH /communityPlatform/registeredMember/sessions without any
 *   Authorization header using a cloned connection with empty headers.
 * - Assert that the call throws an error. Do not validate status codes or error
 *   messages per testing constraints.
 *
 * Steps:
 *
 * 1. Create an unauthenticated connection by copying the given connection and
 *    setting headers to an empty object (no further header manipulation).
 * 2. Prepare a minimal, type-safe request body that satisfies
 *    ICommunityPlatformSession.IRequest (all properties optional).
 * 3. Invoke the sessions listing API and assert that it throws using
 *    TestValidator.error with an async callback and proper awaits.
 */
export async function test_api_member_sessions_listing_requires_authentication(
  connection: api.IConnection,
) {
  // 1) Create an unauthenticated connection (never touch headers afterwards)
  const unauthConn: api.IConnection = { ...connection, headers: {} };

  // 2) Prepare minimal, type-safe request body
  const requestBody = {
    // All properties optional; minimal valid request
  } satisfies ICommunityPlatformSession.IRequest;

  // 3) Attempt to list sessions without authentication and expect an error
  await TestValidator.error(
    "unauthenticated sessions listing should be rejected",
    async () => {
      await api.functional.communityPlatform.registeredMember.sessions.index(
        unauthConn,
        { body: requestBody },
      );
    },
  );
}
