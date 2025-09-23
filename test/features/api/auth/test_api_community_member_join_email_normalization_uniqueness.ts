import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

export async function test_api_community_member_join_email_normalization_uniqueness(
  connection: api.IConnection,
) {
  /**
   * Validate case-insensitive email normalization uniqueness on join.
   *
   * Steps:
   *
   * 1. Create two independent unauthenticated connections to avoid auth
   *    side-effects.
   * 2. Build two emails from one random local-part: mixed-case vs lowercase.
   * 3. Join successfully with mixed-case email.
   * 4. Attempt to join again with the same email in lowercase using a different
   *    username and expect failure.
   */

  // 1) Two independent unauthenticated connections (do not touch original headers directly)
  const conn1: api.IConnection = { ...connection, headers: {} };
  const conn2: api.IConnection = { ...connection, headers: {} };

  // 2) Construct deterministic test emails sharing same normalization
  const local: string = RandomGenerator.alphabets(8);
  const emailLower: string = `${local}@example.com`;
  const emailMixed: string = `${local[0].toUpperCase()}${local.slice(1)}@Example.COM`;

  // Local sanity: mixed lowercased equals lowercase baseline
  TestValidator.equals(
    "email strings normalize to same lowercase",
    emailMixed.toLowerCase(),
    emailLower,
  );

  // 3) First join succeeds
  const createBody1 = {
    username: `user_${RandomGenerator.alphaNumeric(10)}`,
    email: emailMixed,
    password: "A1b2c3d4!",
  } satisfies ICommunityPlatformCommunityMember.ICreate;

  const first = await api.functional.auth.communityMember.join(conn1, {
    body: createBody1,
  });
  typia.assert(first);

  // 4) Second join fails with same normalized email but different username
  const createBody2 = {
    username: `user_${RandomGenerator.alphaNumeric(10)}`,
    email: emailLower,
    password: "A1b2c3d4!",
  } satisfies ICommunityPlatformCommunityMember.ICreate;

  await TestValidator.error(
    "duplicated normalized email should be rejected",
    async () => {
      await api.functional.auth.communityMember.join(conn2, {
        body: createBody2,
      });
    },
  );
}
