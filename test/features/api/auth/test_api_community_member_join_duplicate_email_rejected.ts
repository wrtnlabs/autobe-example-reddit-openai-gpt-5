import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

/**
 * Enforce unique, case-insensitive email on community member registration.
 *
 * Business goal:
 *
 * - A user should be able to join once with a given email.
 * - A second join attempt with the same email (even with different casing) must
 *   be rejected by server-side uniqueness constraint based on
 *   email_normalized.
 *
 * Steps:
 *
 * 1. Perform a successful join with a fresh email and valid password.
 * 2. Attempt a second join with the same email but different casing and a
 *    different username — expect an error.
 * 3. (Reinforcement) Attempt again with the exact same email casing — expect an
 *    error as well.
 *
 * Important notes:
 *
 * - Use precise DTO variants (ICreate for request, IAuthorized for response).
 * - Use `satisfies` on request body.
 * - Rely on typia.assert() for complete response validation.
 * - Do not validate specific HTTP status codes; only verify that an error occurs
 *   for duplicates.
 */
export async function test_api_community_member_join_duplicate_email_rejected(
  connection: api.IConnection,
) {
  // 1) Successful join with fresh email
  const baseEmail: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const firstBody = {
    username: RandomGenerator.name(1),
    email: baseEmail,
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformCommunityMember.ICreate;

  const first = await api.functional.auth.communityMember.join(connection, {
    body: firstBody,
  });
  typia.assert(first);

  // 2) Duplicate attempt with different casing (case-insensitive uniqueness)
  const dupEmailVariant: string = baseEmail.toUpperCase();
  const dupBodyCasing = {
    username: RandomGenerator.name(1),
    email: dupEmailVariant,
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformCommunityMember.ICreate;

  await TestValidator.error(
    "duplicate email (case-insensitive) is rejected",
    async () => {
      await api.functional.auth.communityMember.join(connection, {
        body: dupBodyCasing,
      });
    },
  );

  // 3) Reinforcement: duplicate attempt with exactly same email casing
  const dupBodySameCase = {
    username: RandomGenerator.name(1),
    email: baseEmail,
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformCommunityMember.ICreate;

  await TestValidator.error(
    "duplicate email (same-case) is rejected",
    async () => {
      await api.functional.auth.communityMember.join(connection, {
        body: dupBodySameCase,
      });
    },
  );
}
