import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IClientContext } from "@ORGANIZATION/PROJECT-api/lib/structures/IClientContext";
import type { ICommunityPlatformRegisteredMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRegisteredMember";
import type { ICommunityPlatformSession } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSession";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformSession } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformSession";

export async function test_api_auth_session_targeted_revocation_current_device(
  connection: api.IConnection,
) {
  /**
   * Targeted session revocation for current device with idempotency check.
   *
   * Steps:
   *
   * 1. Register a member (join) to obtain an authenticated session.
   * 2. List own sessions and pick a current active session (latest createdAt).
   * 3. Revoke that session and validate the result.
   * 4. Verify protected resource access fails with the same (now-revoked) token.
   * 5. Revoke the same session again to confirm idempotent behavior.
   */

  // 1) Register a new member → authenticated session established automatically by SDK
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    username: RandomGenerator.name(1).replace(/\s+/g, "-"),
    password: RandomGenerator.alphaNumeric(16),
    displayName: RandomGenerator.name(),
    client: {
      userAgent: `e2e/${RandomGenerator.alphaNumeric(6)}`,
      ip: "127.0.0.1",
      clientPlatform: "node-e2e",
      clientDevice: "e2e-runner",
      sessionType: "standard",
    } satisfies IClientContext,
  } satisfies ICommunityPlatformRegisteredMember.IJoin;
  const authorized = await api.functional.auth.registeredMember.join(
    connection,
    {
      body: joinBody,
    },
  );
  typia.assert(authorized);

  // 2) List current user's sessions and pick an active one (prefer latest createdAt)
  const page =
    await api.functional.communityPlatform.registeredMember.me.sessions.index(
      connection,
    );
  typia.assert(page);
  TestValidator.predicate(
    "sessions list must contain at least one session (current device)",
    page.data.length > 0,
  );

  const activeCandidates = page.data.filter((s) => s.revokedAt === undefined);
  const pool = activeCandidates.length > 0 ? activeCandidates : page.data;
  const targetSession = pool.reduce((latest, cur) =>
    cur.createdAt > latest.createdAt ? cur : latest,
  );

  // 3) Revoke the chosen session
  const first =
    await api.functional.auth.registeredMember.sessions.revokeSession(
      connection,
      { sessionId: targetSession.id },
    );
  typia.assert(first);
  TestValidator.equals(
    "revocation result refers to the targeted session id",
    first.session_id,
    targetSession.id,
  );
  TestValidator.predicate(
    "first revocation status should be success-like (revoked | already_revoked)",
    first.status === "revoked" || first.status === "already_revoked",
  );

  // 4) Access to protected endpoint should fail using the same (revoked) token
  await TestValidator.error(
    "protected call with revoked token must fail",
    async () => {
      await api.functional.communityPlatform.registeredMember.me.at(connection);
    },
  );

  // 5) Call revoke again to verify idempotency behavior
  const second =
    await api.functional.auth.registeredMember.sessions.revokeSession(
      connection,
      { sessionId: targetSession.id },
    );
  typia.assert(second);
  TestValidator.equals(
    "second revocation targets the same session id",
    second.session_id,
    targetSession.id,
  );
  TestValidator.equals(
    "second revocation is idempotent (already_revoked)",
    second.status,
    "already_revoked",
  );
}
