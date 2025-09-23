import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

/**
 * Successful registration of a community member and authorization bundle
 * issuance.
 *
 * Flow:
 *
 * 1. Generate unique credentials (username/email/password).
 * 2. Call POST /auth/communityMember/join with
 *    ICommunityPlatformCommunityMember.ICreate.
 * 3. Validate IAuthorized response shape and business consistency:
 *
 *    - Token.access and token.refresh are non-empty strings
 *    - Token.refreshable_until is not earlier than token.expired_at
 *    - When user is hydrated, its id equals subject id and username echoes input
 *
 * Constraints:
 *
 * - Never touch connection.headers; the SDK manages Authorization automatically.
 */
export async function test_api_community_member_join_successful_registration(
  connection: api.IConnection,
) {
  // 1) Generate join payload
  const joinBody = {
    username: `member_${RandomGenerator.alphabets(12)}`,
    email: typia.random<string & tags.Format<"email">>(),
    password: RandomGenerator.alphaNumeric(12), // >= 8 chars
  } satisfies ICommunityPlatformCommunityMember.ICreate;

  // 2) Execute join
  const authorized = await api.functional.auth.communityMember.join(
    connection,
    {
      body: joinBody,
    },
  );
  typia.assert(authorized);

  // 3) Token bundle sanity checks (business-level)
  TestValidator.predicate(
    "access token should be non-empty",
    authorized.token.access.length > 0,
  );
  TestValidator.predicate(
    "refresh token should be non-empty",
    authorized.token.refresh.length > 0,
  );
  const expiredAtMs = new Date(authorized.token.expired_at).getTime();
  const refreshableUntilMs = new Date(
    authorized.token.refreshable_until,
  ).getTime();
  TestValidator.predicate(
    "refreshable_until should be later than or equal to expired_at",
    refreshableUntilMs >= expiredAtMs,
  );

  // 4) Optional hydrated user validations
  if (authorized.user !== null && authorized.user !== undefined) {
    typia.assert(authorized.user);
    TestValidator.equals(
      "authorized.id equals user.id",
      authorized.user.id,
      authorized.id,
    );
    TestValidator.equals(
      "user.username equals requested username",
      authorized.user.username,
      joinBody.username,
    );
  }
}
