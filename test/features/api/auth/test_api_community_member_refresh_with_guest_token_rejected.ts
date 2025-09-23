import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformGuestVisitor } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformGuestVisitor";
import type { ICommunityPlatformGuestVisitorJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformGuestVisitorJoin";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

/**
 * Reject communityMember token refresh with a guest refresh token.
 *
 * Business rule: Roles must be isolated. A refresh token issued for a guest
 * visitor (via /auth/guestVisitor/join) must not be accepted by the
 * communityMember refresh endpoint (/auth/communityMember/refresh), which only
 * renews sessions for authenticated members.
 *
 * Steps
 *
 * 1. Join as a guest visitor to obtain a guest token bundle.
 * 2. Attempt communityMember.refresh with the guest refresh token.
 * 3. Expect an error (do not assert any specific HTTP status) and ensure no
 *    communityMember authorization is produced.
 *
 * Simulate mode consideration: When connection.simulate === true, the SDK will
 * return random success data. In that case, we simply assert the simulated
 * response structure instead of enforcing rejection.
 */
export async function test_api_community_member_refresh_with_guest_token_rejected(
  connection: api.IConnection,
) {
  // 1) Guest join to obtain guest tokens
  const guestJoinBody = {
    device_fingerprint: RandomGenerator.alphaNumeric(32), // <= 512 chars
    user_agent: `e2e-agent/${RandomGenerator.alphaNumeric(8)}`,
    ip: "203.0.113.1",
  } satisfies ICommunityPlatformGuestVisitorJoin.ICreate;

  const guestAuth: ICommunityPlatformGuestVisitor.IAuthorized =
    await api.functional.auth.guestVisitor.join(connection, {
      body: guestJoinBody,
    });
  typia.assert(guestAuth);

  // 2) Attempt communityMember.refresh using the GUEST refresh token
  const memberRefreshBody = {
    refresh_token: guestAuth.token.refresh,
  } satisfies ICommunityPlatformCommunityMember.IRefresh;

  if (connection.simulate === true) {
    // In simulate mode, random successful data may be returned irrespective of business rules
    const simulated = await api.functional.auth.communityMember.refresh(
      connection,
      {
        body: memberRefreshBody,
      },
    );
    typia.assert(simulated);
  } else {
    // 3) Expect runtime error (authorization failure)
    await TestValidator.error(
      "communityMember.refresh must reject a guest refresh token",
      async () => {
        await api.functional.auth.communityMember.refresh(connection, {
          body: memberRefreshBody,
        });
      },
    );
  }
}
