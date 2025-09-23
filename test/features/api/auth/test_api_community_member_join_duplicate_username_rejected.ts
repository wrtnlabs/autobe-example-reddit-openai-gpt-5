import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

/**
 * Enforce unique username on community member registration.
 *
 * Scenario:
 *
 * 1. Join with a fresh username and email → expect success with issued token.
 * 2. Try joining again with the SAME username but a DIFFERENT email → expect
 *    error.
 * 3. (Optional guard) Try joining with DIFFERENT username but SAME email → expect
 *    error.
 *
 * Notes:
 *
 * - Request body uses ICommunityPlatformCommunityMember.ICreate.
 * - Response is ICommunityPlatformCommunityMember.IAuthorized; if `user` is
 *   hydrated, verify returned username equals input.
 * - Do not validate HTTP status codes; only assert that an error occurs.
 * - Never touch connection.headers — SDK handles token automatically.
 */
export async function test_api_community_member_join_duplicate_username_rejected(
  connection: api.IConnection,
) {
  // Prepare unique inputs for the first successful registration
  const username: string = `user_${RandomGenerator.alphabets(8)}`;
  const email1: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const pass1: string = RandomGenerator.alphaNumeric(12);

  // 1) Happy path: successful join
  const authorized1: ICommunityPlatformCommunityMember.IAuthorized =
    await api.functional.auth.communityMember.join(connection, {
      body: {
        username,
        email: email1,
        password: pass1,
      } satisfies ICommunityPlatformCommunityMember.ICreate,
    });
  typia.assert(authorized1);

  // If server returns hydrated user, ensure echoed username matches input
  if (authorized1.user !== undefined) {
    TestValidator.equals(
      "joined user.username equals input username",
      authorized1.user.username,
      username,
    );
  }

  // 2) Attempt duplicate username with a different email → must fail
  const email2: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const pass2: string = RandomGenerator.alphaNumeric(12);
  await TestValidator.error("duplicate username must be rejected", async () => {
    await api.functional.auth.communityMember.join(connection, {
      body: {
        username, // same username as first join
        email: email2, // different email
        password: pass2,
      } satisfies ICommunityPlatformCommunityMember.ICreate,
    });
  });

  // 3) Optional guard: duplicate email with a different username → must fail
  const username2: string = `user_${RandomGenerator.alphabets(8)}`;
  const pass3: string = RandomGenerator.alphaNumeric(12);
  await TestValidator.error("duplicate email must be rejected", async () => {
    await api.functional.auth.communityMember.join(connection, {
      body: {
        username: username2, // different username
        email: email1, // same email as first join
        password: pass3,
      } satisfies ICommunityPlatformCommunityMember.ICreate,
    });
  });
}
