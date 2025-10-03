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

/**
 * Enforce ownership on session detail: User A must not read User B's session.
 *
 * Steps
 *
 * 1. Create two registered members (A, B) via join using isolated connections so
 *    tokens don't collide
 * 2. Under B's connection, list sessions and capture a valid sessionId
 * 3. Under A's connection, attempt to GET B's session by id and expect an error
 *    (authorization forbidden)
 * 4. Positive controls: B can read their own session; A can read their own session
 *    as well
 */
export async function test_api_session_detail_cross_account_forbidden(
  connection: api.IConnection,
) {
  // Prepare isolated connections to avoid token overwrite
  const connA: api.IConnection = { ...connection, headers: {} };
  const connB: api.IConnection = { ...connection, headers: {} };

  // 1) Register User A
  const authA = await api.functional.auth.registeredMember.join(connA, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      username: `user_${RandomGenerator.alphaNumeric(8)}`,
      password: RandomGenerator.alphaNumeric(12),
      displayName: RandomGenerator.name(2),
      client: {
        userAgent: "e2e/agent A",
        clientPlatform: "node/e2e",
        clientDevice: "local",
        sessionType: "standard",
        ip: "127.0.0.1",
      },
    } satisfies ICommunityPlatformRegisteredMember.IJoin,
  });
  typia.assert(authA);

  // 1) Register User B
  const authB = await api.functional.auth.registeredMember.join(connB, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      username: `user_${RandomGenerator.alphaNumeric(8)}`,
      password: RandomGenerator.alphaNumeric(12),
      displayName: RandomGenerator.name(2),
      client: {
        userAgent: "e2e/agent B",
        clientPlatform: "node/e2e",
        clientDevice: "local",
        sessionType: "standard",
        ip: "127.0.0.2",
      },
    } satisfies ICommunityPlatformRegisteredMember.IJoin,
  });
  typia.assert(authB);

  // 2) B lists their sessions and picks one sessionId
  const pageB =
    await api.functional.communityPlatform.registeredMember.me.sessions.index(
      connB,
    );
  typia.assert(pageB);
  TestValidator.predicate(
    "B should have at least one session entry",
    pageB.data.length > 0,
  );
  const bSessionId = pageB.data[0].id; // string & tags.Format<"uuid">

  // Positive control: B can fetch their own session
  const bOwnSession =
    await api.functional.communityPlatform.registeredMember.sessions.at(connB, {
      sessionId: bSessionId,
    });
  typia.assert(bOwnSession);

  // 3) A attempts to read B's session detail -> must fail (authorization error)
  await TestValidator.error(
    "cross-account access must be forbidden (A -> B's session)",
    async () => {
      await api.functional.communityPlatform.registeredMember.sessions.at(
        connA,
        { sessionId: bSessionId },
      );
    },
  );

  // 4) Optional positive control: A can access their own session
  const pageA =
    await api.functional.communityPlatform.registeredMember.me.sessions.index(
      connA,
    );
  typia.assert(pageA);
  TestValidator.predicate(
    "A should have at least one session entry",
    pageA.data.length > 0,
  );
  const aSessionId = pageA.data[0].id;
  const aOwnSession =
    await api.functional.communityPlatform.registeredMember.sessions.at(connA, {
      sessionId: aSessionId,
    });
  typia.assert(aOwnSession);
}
