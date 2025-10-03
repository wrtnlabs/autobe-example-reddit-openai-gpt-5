import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IClientContext } from "@ORGANIZATION/PROJECT-api/lib/structures/IClientContext";
import type { ICommunityPlatformRegisteredMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRegisteredMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

export async function test_api_user_profile_update_cross_account_forbidden(
  connection: api.IConnection,
) {
  /**
   * Cross-account user profile update must be forbidden.
   *
   * Steps:
   *
   * 1. Prepare two isolated connections (connA for User A, connB for User B).
   * 2. Join User A on connA and User B on connB.
   * 3. With User A's token (connA), attempt to update User B → expect error.
   * 4. With User B's token (connB), update User B successfully and validate.
   */
  // 1) Prepare isolated connections so that SDK-managed Authorization headers do not overwrite each other
  const connA: api.IConnection = { ...connection, headers: {} };
  const connB: api.IConnection = { ...connection, headers: {} };

  // Helper to create a username with minimum length >= 5 to be safe across systems
  const makeUsername = (): string =>
    RandomGenerator.paragraph({ sentences: 1, wordMin: 5, wordMax: 12 });

  // Helper to create a password string
  const makePassword = (): string => `Pw-${RandomGenerator.alphaNumeric(12)}`;

  // 2) Join User A
  const joinBodyA = {
    email: typia.random<string & tags.Format<"email">>(),
    username: makeUsername(),
    password: makePassword(),
    displayName: RandomGenerator.paragraph({
      sentences: 2,
      wordMin: 3,
      wordMax: 8,
    }),
  } satisfies ICommunityPlatformRegisteredMember.IJoin;
  const authorizedA: ICommunityPlatformRegisteredMember.IAuthorized =
    await api.functional.auth.registeredMember.join(connA, { body: joinBodyA });
  typia.assert(authorizedA);

  // 2) Join User B
  const joinBodyB = {
    email: typia.random<string & tags.Format<"email">>(),
    username: makeUsername(),
    password: makePassword(),
    displayName: RandomGenerator.paragraph({
      sentences: 2,
      wordMin: 3,
      wordMax: 8,
    }),
  } satisfies ICommunityPlatformRegisteredMember.IJoin;
  const authorizedB: ICommunityPlatformRegisteredMember.IAuthorized =
    await api.functional.auth.registeredMember.join(connB, { body: joinBodyB });
  typia.assert(authorizedB);

  // 3) Cross-account forbidden attempt: With User A's token, try to update User B
  const desiredDisplayName = RandomGenerator.paragraph({
    sentences: 2,
    wordMin: 3,
    wordMax: 12,
  });
  await TestValidator.error(
    "non-owner cannot update another user's profile",
    async () => {
      await api.functional.communityPlatform.registeredMember.users.update(
        connA,
        {
          userId: authorizedB.id,
          body: {
            displayName: desiredDisplayName,
          } satisfies ICommunityPlatformUser.IUpdate,
        },
      );
    },
  );

  // 4) Owner update success: With User B's token, update User B
  const updated: ICommunityPlatformUser =
    await api.functional.communityPlatform.registeredMember.users.update(
      connB,
      {
        userId: authorizedB.id,
        body: {
          displayName: desiredDisplayName,
        } satisfies ICommunityPlatformUser.IUpdate,
      },
    );
  typia.assert(updated);

  // Validate identity consistency and that displayName is applied
  TestValidator.equals(
    "updated id must equal B's id",
    updated.id,
    authorizedB.id,
  );
  const updatedDisplayName = typia.assert<string>(updated.displayName!);
  TestValidator.equals(
    "displayName should be updated",
    updatedDisplayName,
    desiredDisplayName,
  );
}
