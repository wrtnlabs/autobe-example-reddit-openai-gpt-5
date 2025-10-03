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
 * Verify that an authenticated registered member can retrieve details of their
 * own session.
 *
 * Business steps:
 *
 * 1. Join as a new registered member to establish authentication and create an
 *    initial session.
 * 2. List the caller's sessions and pick a valid sessionId.
 * 3. Fetch session detail by that sessionId and verify ownership (id matches),
 *    timestamps (via typia.assert), and that sensitive fields are not exposed.
 * 4. Validate that client context hints provided on join are persisted in the
 *    session record.
 * 5. Optionally, confirm that a random non-existent sessionId results in an error
 *    (skip when simulate mode is on).
 */
export async function test_api_session_detail_owned_session_success(
  connection: api.IConnection,
) {
  // 1) Join as a new registered member (establishes initial session)
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const username: string = `user_${RandomGenerator.alphaNumeric(12)}`;
  const password: string = `P@${RandomGenerator.alphaNumeric(14)}`;

  const userAgent = `E2E/SessionDetailTest ${RandomGenerator.alphaNumeric(6)}`;
  const ip = "127.0.0.1";
  const clientPlatform = "node-e2e";
  const clientDevice = "ci-runner";
  const sessionType = "standard";

  const auth = await api.functional.auth.registeredMember.join(connection, {
    body: {
      email,
      username,
      password,
      displayName: RandomGenerator.name(1),
      client: {
        userAgent,
        ip,
        clientPlatform,
        clientDevice,
        sessionType,
      },
    } satisfies ICommunityPlatformRegisteredMember.IJoin,
  });
  typia.assert(auth);

  // 2) List sessions for the current user
  const page =
    await api.functional.communityPlatform.registeredMember.me.sessions.index(
      connection,
    );
  typia.assert(page);

  TestValidator.predicate(
    "sessions listing should contain at least one session for the new member",
    page.data.length >= 1,
  );

  // Select a session to inspect (e.g., the first one)
  const selected = page.data[0];

  // 3) Fetch session detail
  const detail =
    await api.functional.communityPlatform.registeredMember.sessions.at(
      connection,
      { sessionId: selected.id },
    );
  typia.assert(detail);

  // Ownership check via id equality (id from caller's own listing)
  TestValidator.equals(
    "session detail id must match the selected listing id",
    detail.id,
    selected.id,
  );

  // Sensitive information must not be exposed
  TestValidator.predicate(
    "session DTO must not expose hashed_token or hashedToken fields",
    !("hashed_token" in detail) && !("hashedToken" in detail),
  );

  // Newly created active session should not be revoked
  TestValidator.equals(
    "revokedAt should be undefined for a newly created active session",
    detail.revokedAt,
    undefined,
  );

  // Client hints persisted
  TestValidator.equals(
    "userAgent should persist from client hints",
    detail.userAgent,
    userAgent,
  );
  TestValidator.equals("ip should persist from client hints", detail.ip, ip);
  TestValidator.equals(
    "clientPlatform should persist from client hints",
    detail.clientPlatform,
    clientPlatform,
  );
  TestValidator.equals(
    "clientDevice should persist from client hints",
    detail.clientDevice,
    clientDevice,
  );
  TestValidator.equals(
    "sessionType should persist from client hints",
    detail.sessionType,
    sessionType,
  );

  // 5) Optional negative path: ask for a random session id (should fail) — skip in simulate mode
  if (connection.simulate !== true) {
    await TestValidator.error(
      "requesting a non-existent sessionId should result in an error",
      async () => {
        await api.functional.communityPlatform.registeredMember.sessions.at(
          connection,
          { sessionId: typia.random<string & tags.Format<"uuid">>() },
        );
      },
    );
  }
}
