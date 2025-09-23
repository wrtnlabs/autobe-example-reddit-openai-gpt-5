import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

export async function test_api_community_member_refresh_after_current_session_revoked(
  connection: api.IConnection,
) {
  /** 1. Join a new community member to obtain a refresh token */
  const authorized = await api.functional.auth.communityMember.join(
    connection,
    {
      body: {
        username: `${RandomGenerator.name(1)}_${RandomGenerator.alphaNumeric(6)}`,
        email: typia.random<string & tags.Format<"email">>(),
        password: RandomGenerator.alphaNumeric(12),
      } satisfies ICommunityPlatformCommunityMember.ICreate,
    },
  );
  typia.assert(authorized);

  const previousRefreshToken: string = authorized.token.refresh;

  /** 2. Logout to revoke the current session */
  await api.functional.auth.communityMember.logout(connection);

  /** 3. Attempt to refresh with the now-revoked refresh token → must fail */
  await TestValidator.error(
    "refresh must fail after current session has been revoked",
    async () => {
      await api.functional.auth.communityMember.refresh(connection, {
        body: {
          refresh_token: previousRefreshToken,
        } satisfies ICommunityPlatformCommunityMember.IRefresh,
      });
    },
  );
}
