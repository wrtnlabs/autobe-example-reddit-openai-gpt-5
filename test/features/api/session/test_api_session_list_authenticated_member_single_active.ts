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
 * List sessions of the authenticated registered member and validate basic
 * contract.
 *
 * Business goals
 *
 * - After creating a fresh registered member (join), list the member's sessions
 *   and verify at least one active session exists (the current
 *   device/session).
 * - Ensure the session entity exposes only non-sensitive metadata (no
 *   hashed_token leak) and timestamps follow ISO-8601 formats.
 * - Verify deterministic ordering by non-increasing activity time using
 *   (lastSeenAt ?? createdAt) as the primary sort key.
 * - Re-fetch to confirm membership stability (IDs unchanged ignoring order).
 * - Switch identity by registering another user and confirm ownership scoping:
 *   the second user's sessions do not overlap with the first user's.
 *
 * Notes
 *
 * - In simulate mode, data is randomly generated per call. To avoid false
 *   negatives, only perform type assertions and skip business assertions when
 *   connection.simulate === true.
 */
export async function test_api_session_list_authenticated_member_single_active(
  connection: api.IConnection,
) {
  // 0) If simulation is enabled, restrict to type assertions only
  if (connection.simulate === true) {
    const authSim = await api.functional.auth.registeredMember.join(
      connection,
      {
        body: {
          email: typia.random<string & tags.Format<"email">>(),
          username: RandomGenerator.alphaNumeric(12),
          password: RandomGenerator.alphaNumeric(16),
          displayName: RandomGenerator.name(1),
          client: {
            userAgent: `e2e-sim/${RandomGenerator.alphaNumeric(6)}`,
            ip: `127.0.${Math.floor(Math.random() * 255)}.${Math.floor(
              Math.random() * 255,
            )}`,
            clientPlatform: "node-e2e",
            clientDevice: "ci-runner",
            sessionType: "standard",
          } satisfies IClientContext,
        } satisfies ICommunityPlatformRegisteredMember.IJoin,
      },
    );
    typia.assert(authSim);

    const pageSim =
      await api.functional.communityPlatform.registeredMember.me.sessions.index(
        connection,
      );
    typia.assert(pageSim);
    return; // Skip business-specific assertions in simulate mode
  }

  // 1) Register Member A (authorization is set by SDK)
  const clientA = {
    userAgent: `e2e/${RandomGenerator.alphaNumeric(8)}`,
    ip: `10.0.${Math.floor(Math.random() * 255)}.${Math.floor(
      Math.random() * 255,
    )}`,
    clientPlatform: "node-e2e",
    clientDevice: "local-dev",
    sessionType: "standard",
  } satisfies IClientContext;
  const emailA: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const authA = await api.functional.auth.registeredMember.join(connection, {
    body: {
      email: emailA,
      username: `user_${RandomGenerator.alphaNumeric(6)}`,
      password: RandomGenerator.alphaNumeric(16),
      displayName: RandomGenerator.name(1),
      client: clientA,
    } satisfies ICommunityPlatformRegisteredMember.IJoin,
  });
  typia.assert(authA);

  // 2) List sessions for Member A
  const pageA1 =
    await api.functional.communityPlatform.registeredMember.me.sessions.index(
      connection,
    );
  typia.assert(pageA1);

  // 3) Business validations for Member A
  TestValidator.predicate(
    "member A has at least one session",
    pageA1.data.length >= 1,
  );
  TestValidator.predicate(
    "no sensitive hashed_token property exposed",
    pageA1.data.every(
      (s) => !("hashed_token" in (s as unknown as Record<string, unknown>)),
    ),
  );

  // Deterministic ordering: non-increasing by lastSeenAt ?? createdAt
  for (let i = 1; i < pageA1.data.length; i++) {
    const prev = pageA1.data[i - 1];
    const curr = pageA1.data[i];
    const prevKey = prev.lastSeenAt ?? prev.createdAt;
    const currKey = curr.lastSeenAt ?? curr.createdAt;
    const prevTime = Date.parse(prevKey);
    const currTime = Date.parse(currKey);
    TestValidator.predicate(
      `ordering non-increasing at index ${i}`,
      currTime <= prevTime,
    );
  }

  // Pagination sanity checks
  TestValidator.predicate(
    "pagination limit is positive",
    pageA1.pagination.limit > 0,
  );
  if (pageA1.pagination.records > 0) {
    TestValidator.predicate(
      "pages should be at least 1 when records > 0",
      pageA1.pagination.pages >= 1,
    );
  }

  // 4) Re-fetch to confirm stable membership (IDs unchanged ignoring order)
  const pageA2 =
    await api.functional.communityPlatform.registeredMember.me.sessions.index(
      connection,
    );
  typia.assert(pageA2);

  const idsA1 = pageA1.data.map((s) => s.id).sort();
  const idsA2 = pageA2.data.map((s) => s.id).sort();
  TestValidator.equals(
    "session ID set remains stable across successive reads",
    idsA2,
    idsA1,
  );

  // Preserve A's session IDs for ownership scoping check
  const idsASet = new Set(idsA1);

  // 5) Register Member B (authorization switches automatically)
  const clientB = {
    userAgent: `e2e/${RandomGenerator.alphaNumeric(8)}`,
    ip: `10.1.${Math.floor(Math.random() * 255)}.${Math.floor(
      Math.random() * 255,
    )}`,
    clientPlatform: "node-e2e",
    clientDevice: "local-dev",
    sessionType: "standard",
  } satisfies IClientContext;
  const authB = await api.functional.auth.registeredMember.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      username: `user_${RandomGenerator.alphaNumeric(6)}`,
      password: RandomGenerator.alphaNumeric(16),
      displayName: RandomGenerator.name(1),
      client: clientB,
    } satisfies ICommunityPlatformRegisteredMember.IJoin,
  });
  typia.assert(authB);

  const pageB =
    await api.functional.communityPlatform.registeredMember.me.sessions.index(
      connection,
    );
  typia.assert(pageB);

  // Ownership scoping: Member B's session IDs should not overlap Member A's
  const idsB = pageB.data.map((s) => s.id);
  TestValidator.predicate(
    "no session ID overlap between different members",
    idsB.every((id) => !idsASet.has(id)),
  );
}
