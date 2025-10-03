import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IClientContext } from "@ORGANIZATION/PROJECT-api/lib/structures/IClientContext";
import type { ICommunityPlatformRegisteredMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRegisteredMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

/**
 * Validate self-deactivation (soft delete) and rejection of protected actions
 * thereafter.
 *
 * Business flow:
 *
 * 1. Register a member via join, which also authenticates the SDK connection
 *    automatically.
 * 2. Guest guard: with an unauthenticated connection (fresh headers: {}), attempt
 *    to call a protected operation (erase) and expect failure.
 * 3. Self-deactivate: call erase for the member's own userId; expect success (void
 *    on 204).
 * 4. Post-deactivation rejection: attempt another protected call using the same
 *    (now-deactivated) session and expect it to fail. We do not assert specific
 *    status codes or messages.
 *
 * Notes:
 *
 * - We only use the provided APIs: auth.registeredMember.join and
 *   communityPlatform.registeredMember.users.erase.
 * - We avoid status/message checks and never touch connection.headers beyond
 *   making an unauthenticated clone.
 */
export async function test_api_user_account_deactivation_self_and_session_revocation(
  connection: api.IConnection,
) {
  // 1) Register a member (obtains token automatically via SDK)
  const joinOutput = await api.functional.auth.registeredMember.join(
    connection,
    {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        username: RandomGenerator.alphabets(10),
        password: RandomGenerator.alphaNumeric(12),
        displayName: RandomGenerator.name(),
        client: {
          userAgent: `e2e/${RandomGenerator.alphaNumeric(8)}`,
          ip: "127.0.0.1",
          clientPlatform: "node-e2e",
          clientDevice: "ci-runner",
          sessionType: "standard",
        },
      } satisfies ICommunityPlatformRegisteredMember.IJoin,
    },
  );
  typia.assert(joinOutput);

  // Optional consistency check: embedded summary id matches principal id when present
  if (joinOutput.user !== undefined) {
    TestValidator.equals(
      "authorized payload id matches embedded user id (when present)",
      joinOutput.id,
      joinOutput.user.id,
    );
  }

  // 2) Guest guard: use an unauthenticated connection and ensure protected action fails
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "guest cannot call protected erase endpoint",
    async () => {
      await api.functional.communityPlatform.registeredMember.users.erase(
        unauthConn,
        {
          userId: joinOutput.id,
        },
      );
    },
  );

  // 3) Self-deactivate (soft delete)
  await api.functional.communityPlatform.registeredMember.users.erase(
    connection,
    {
      userId: joinOutput.id,
    },
  );

  // 4) Post-deactivation: any further protected operation should be rejected
  const randomOtherUserId = typia.random<string & tags.Format<"uuid">>();
  await TestValidator.error(
    "post-deactivation, protected operation must be rejected",
    async () => {
      await api.functional.communityPlatform.registeredMember.users.erase(
        connection,
        {
          userId: randomOtherUserId,
        },
      );
    },
  );
}
