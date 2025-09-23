import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

/**
 * Validate refresh flow for a community member with an active session.
 *
 * Business goals:
 *
 * - Ensure a newly joined community member can exchange a valid refresh token for
 *   a fresh authorization bundle while preserving identity.
 * - Confirm token time semantics (expired_at and refreshable_until are in the
 *   future).
 * - Validate business error handling for malformed refresh token and for using an
 *   access token as if it were a refresh token.
 *
 * Constraints and rules:
 *
 * - Use correct DTO variants: ICreate for join, IRefresh for refresh, and assert
 *   IAuthorized responses via typia.assert().
 * - No type-error tests; negative cases must remain type-correct.
 * - Do not access or mutate connection.headers; SDK handles authentication.
 */
export async function test_api_community_member_refresh_with_active_session(
  connection: api.IConnection,
) {
  // 1) Register a new community member to obtain initial tokens
  const createBody = {
    username: `member_${RandomGenerator.alphaNumeric(12)}`,
    email: typia.random<string & tags.Format<"email">>(),
    password: `P${RandomGenerator.alphaNumeric(10)}x`, // >= 8 chars
  } satisfies ICommunityPlatformCommunityMember.ICreate;

  const joined = await api.functional.auth.communityMember.join(connection, {
    body: createBody,
  });
  typia.assert(joined);

  // 2) Refresh using the refresh token from the join response
  const refreshBody = {
    refresh_token: joined.token.refresh,
  } satisfies ICommunityPlatformCommunityMember.IRefresh;

  const refreshed = await api.functional.auth.communityMember.refresh(
    connection,
    { body: refreshBody },
  );
  typia.assert(refreshed);

  // 3) Identity consistency
  TestValidator.equals(
    "refreshed subject id matches the joined subject id",
    refreshed.id,
    joined.id,
  );
  if (joined.user && refreshed.user) {
    TestValidator.equals(
      "refreshed username matches the joined username (when hydrated)",
      refreshed.user.username,
      joined.user.username,
    );
  }

  // 4) Token temporal semantics (must be in the future)
  const now = Date.now();
  const accessExp = new Date(refreshed.token.expired_at).getTime();
  const refreshableUntil = new Date(
    refreshed.token.refreshable_until,
  ).getTime();
  TestValidator.predicate(
    "access token expiry should be in the future",
    accessExp > now,
  );
  TestValidator.predicate(
    "refresh token refreshable_until should be in the future",
    refreshableUntil > now,
  );

  // 5) Negative: malformed refresh token (type-correct but invalid value)
  const malformedToken = `not.jwt.${RandomGenerator.alphaNumeric(8)}`;
  await TestValidator.error(
    "malformed refresh token should be rejected",
    async () => {
      await api.functional.auth.communityMember.refresh(connection, {
        body: {
          refresh_token: malformedToken,
        } satisfies ICommunityPlatformCommunityMember.IRefresh,
      });
    },
  );

  // 6) Negative: using an access token string instead of refresh token
  await TestValidator.error(
    "using access token as refresh token should be rejected",
    async () => {
      await api.functional.auth.communityMember.refresh(connection, {
        body: {
          refresh_token: joined.token.access,
        } satisfies ICommunityPlatformCommunityMember.IRefresh,
      });
    },
  );
}
