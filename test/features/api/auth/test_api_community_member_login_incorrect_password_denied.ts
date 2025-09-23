import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

export async function test_api_community_member_login_incorrect_password_denied(
  connection: api.IConnection,
) {
  // 1) Provision a community member account
  const username: string = RandomGenerator.alphabets(12);
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const correctPassword: string = RandomGenerator.alphaNumeric(12);

  const joinBody = {
    username,
    email,
    password: correctPassword,
  } satisfies ICommunityPlatformCommunityMember.ICreate;

  const joined = await api.functional.auth.communityMember.join(connection, {
    body: joinBody,
  });
  typia.assert(joined);

  // 2) Attempt login with wrong password (must be denied)
  const wrongPassword: string = `${correctPassword}x`;
  await TestValidator.error(
    "deny login when email is correct but password is wrong",
    async () => {
      await api.functional.auth.communityMember.login(connection, {
        body: {
          email,
          password: wrongPassword,
        } satisfies ICommunityPlatformCommunityMember.ILogin,
      });
    },
  );

  // 3) Ensure account remains usable by logging in with the correct password
  const success = await api.functional.auth.communityMember.login(connection, {
    body: {
      email,
      password: correctPassword,
    } satisfies ICommunityPlatformCommunityMember.ILogin,
  });
  typia.assert(success);

  // Correlate identity across join and successful login
  TestValidator.equals(
    "subject id should stay consistent across join and login",
    success.id,
    joined.id,
  );

  // If responses hydrate user payloads, verify consistent username
  if (joined.user && success.user) {
    TestValidator.equals(
      "username remains consistent between join and login",
      success.user.username,
      joined.user.username,
    );
  }
}
