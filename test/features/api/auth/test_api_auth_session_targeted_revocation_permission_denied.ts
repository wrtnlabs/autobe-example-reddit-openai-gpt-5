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

export async function test_api_auth_session_targeted_revocation_permission_denied(
  connection: api.IConnection,
) {
  /**
   * Validate ownership enforcement on session revocation.
   *
   * Steps:
   *
   * 1. Register User A (separate connection A)
   * 2. Register User B (separate connection B)
   * 3. As B, list sessions and capture a sessionId
   * 4. As A, attempt to revoke B's sessionId (should error)
   * 5. As B, revoke own session successfully (sanity)
   */

  // Prepare isolated connections without touching headers afterwards
  const connA: api.IConnection = { ...connection, headers: {} };
  const connB: api.IConnection = { ...connection, headers: {} };

  // 1) Register User A
  const joinBodyA = {
    email: typia.random<string & tags.Format<"email">>(),
    username: RandomGenerator.alphabets(8),
    password: RandomGenerator.alphaNumeric(12),
    displayName: RandomGenerator.name(),
    client: {
      userAgent: `e2e-agent/${RandomGenerator.alphaNumeric(6)}`,
      ip: "127.0.0.1",
      clientPlatform: "e2e",
      clientDevice: "node",
      sessionType: "standard",
    },
  } satisfies ICommunityPlatformRegisteredMember.IJoin;
  const authorizedA: ICommunityPlatformRegisteredMember.IAuthorized =
    await api.functional.auth.registeredMember.join(connA, { body: joinBodyA });
  typia.assert(authorizedA);

  // 2) Register User B
  const joinBodyB = {
    email: typia.random<string & tags.Format<"email">>(),
    username: RandomGenerator.alphabets(8),
    password: RandomGenerator.alphaNumeric(12),
    displayName: RandomGenerator.name(),
    client: {
      userAgent: `e2e-agent/${RandomGenerator.alphaNumeric(6)}`,
      ip: "127.0.0.1",
      clientPlatform: "e2e",
      clientDevice: "node",
      sessionType: "standard",
    },
  } satisfies ICommunityPlatformRegisteredMember.IJoin;
  const authorizedB: ICommunityPlatformRegisteredMember.IAuthorized =
    await api.functional.auth.registeredMember.join(connB, { body: joinBodyB });
  typia.assert(authorizedB);

  // 3) B lists own sessions
  const pageB: IPageICommunityPlatformSession =
    await api.functional.communityPlatform.registeredMember.me.sessions.index(
      connB,
    );
  typia.assert(pageB);
  await TestValidator.predicate(
    "user B should have at least one session",
    async () => pageB.data.length > 0,
  );
  const targetSession: ICommunityPlatformSession = pageB.data[0];
  typia.assert(targetSession);

  // 4) As A, attempt to revoke B's session (should fail)
  await TestValidator.error(
    "ownership enforcement: user A cannot revoke user B's session",
    async () => {
      await api.functional.auth.registeredMember.sessions.revokeSession(connA, {
        sessionId: targetSession.id,
      });
    },
  );

  // 5) Optional sanity: B revokes own session successfully
  const selfResult: ICommunityPlatformRegisteredMember.ISessionRevocationResult =
    await api.functional.auth.registeredMember.sessions.revokeSession(connB, {
      sessionId: targetSession.id,
    });
  typia.assert(selfResult);
  TestValidator.equals(
    "self-revocation result should reference the requested session",
    selfResult.session_id,
    targetSession.id,
  );
  await TestValidator.predicate(
    "self-revocation status is 'revoked' or 'already_revoked'",
    async () =>
      selfResult.status === "revoked" ||
      selfResult.status === "already_revoked",
  );
}
