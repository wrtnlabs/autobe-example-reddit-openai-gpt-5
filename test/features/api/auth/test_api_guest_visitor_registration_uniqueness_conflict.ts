import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IClientContext } from "@ORGANIZATION/PROJECT-api/lib/structures/IClientContext";
import type { ICommunityPlatformGuestVisitor } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformGuestVisitor";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

export async function test_api_guest_visitor_registration_uniqueness_conflict(
  connection: api.IConnection,
) {
  /**
   * Validate guest join uniqueness (case-insensitive) using only POST
   * /auth/guestVisitor/join.
   *
   * Steps:
   *
   * 1. Perform an initial successful join with lowercase email/username.
   * 2. Attempt a second join reusing identifiers with different casing to trigger
   *    normalized uniqueness violation (email_normalized /
   *    username_normalized).
   * 3. Ensure the second call errors (we do not assert HTTP status codes).
   * 4. When available, verify returned user summary matches authorized id.
   */

  // 0) Prepare deterministic, collision-resistant identifiers
  const base: string = RandomGenerator.alphaNumeric(12);
  const emailLower: string = `${base}@example.com`;
  const usernameLower: string = `guest_${base}`;
  const password: string = `Pw_${RandomGenerator.alphaNumeric(16)}`;
  const displayName: string = RandomGenerator.name(1);
  const client: IClientContext = {
    userAgent: `e2e-test/${RandomGenerator.alphaNumeric(6)}`,
    clientPlatform: "node",
    clientDevice: "jest-e2e",
  };

  // 1) First successful join
  const firstAuth = await api.functional.auth.guestVisitor.join(connection, {
    body: {
      email: emailLower,
      username: usernameLower,
      password,
      displayName,
      client,
    } satisfies ICommunityPlatformGuestVisitor.IJoin,
  });
  typia.assert<ICommunityPlatformGuestVisitor.IAuthorized>(firstAuth);

  // Basic business validations (no extra type checks beyond typia.assert)
  TestValidator.predicate(
    "first join returns non-empty access token",
    firstAuth.token.access.length > 0,
  );
  TestValidator.predicate(
    "first join returns non-empty refresh token",
    firstAuth.token.refresh.length > 0,
  );

  if (firstAuth.user !== undefined) {
    typia.assert<ICommunityPlatformUser.ISummary>(firstAuth.user);
    TestValidator.equals(
      "authorized.id equals user.id when summary exists",
      firstAuth.user.id,
      firstAuth.id,
    );
  }

  // 2) Second attempt: reusing identifiers with different casing
  const emailUpper: string = emailLower.toUpperCase();
  const usernameUpper: string = usernameLower.toUpperCase();

  // Expect conflict due to normalized uniqueness (case-insensitive)
  await TestValidator.error(
    "normalized uniqueness conflict on email and username (case-insensitive)",
    async () => {
      await api.functional.auth.guestVisitor.join(connection, {
        body: {
          email: emailUpper,
          username: usernameUpper,
          password,
        } satisfies ICommunityPlatformGuestVisitor.IJoin,
      });
    },
  );
}
