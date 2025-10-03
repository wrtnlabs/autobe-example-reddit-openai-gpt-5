import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IClientContext } from "@ORGANIZATION/PROJECT-api/lib/structures/IClientContext";
import type { ICommunityPlatformRegisteredMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRegisteredMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

export async function test_api_user_profile_update_display_name_by_owner(
  connection: api.IConnection,
) {
  /**
   * Validate that a registered member can update their own displayName via PUT
   * /communityPlatform/registeredMember/users/{userId}.
   *
   * Steps
   *
   * 1. Register a new member (join) and capture principal id and initial summary
   * 2. Update only displayName using ICommunityPlatformUser.IUpdate
   * 3. Validate business invariants (id stable, timestamps coherent, fields
   *    updated)
   * 4. Clear displayName to null and verify persistence
   */
  // 1) Register a new member (join)
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const username: string = `user_${RandomGenerator.alphaNumeric(10)}`;
  const password: string = `P@ssw0rd-${RandomGenerator.alphaNumeric(10)}`;
  const initialDisplayName: string = RandomGenerator.name(1);

  const joinBody = {
    email,
    username,
    password,
    displayName: initialDisplayName,
  } satisfies ICommunityPlatformRegisteredMember.IJoin;

  const authorized: ICommunityPlatformRegisteredMember.IAuthorized =
    await api.functional.auth.registeredMember.join(connection, {
      body: joinBody,
    });
  typia.assert(authorized);

  const principalId = authorized.id; // UUID of the authenticated member
  // Optional baseline created_at from summary if present
  const preSummary = authorized.user; // ICommunityPlatformUser.ISummary | undefined

  // 2) Update only displayName
  const newDisplayName: string = RandomGenerator.name(1);
  const updateBody1 = {
    displayName: newDisplayName,
  } satisfies ICommunityPlatformUser.IUpdate;

  const updated1: ICommunityPlatformUser =
    await api.functional.communityPlatform.registeredMember.users.update(
      connection,
      {
        userId: principalId,
        body: updateBody1,
      },
    );
  typia.assert(updated1);

  // 3) Validate invariants
  TestValidator.equals(
    "displayName should be updated to requested value",
    updated1.displayName,
    newDisplayName,
  );
  TestValidator.equals(
    "id should remain unchanged and match principal id",
    updated1.id,
    principalId,
  );
  TestValidator.equals(
    "email should remain unchanged when not updated",
    updated1.email,
    email,
  );
  TestValidator.equals(
    "username should remain unchanged when not updated",
    updated1.username,
    username,
  );
  // Monotonic timestamps: updatedAt >= createdAt
  TestValidator.predicate(
    "updatedAt should be greater than or equal to createdAt",
    () =>
      new Date(updated1.updatedAt).getTime() >=
      new Date(updated1.createdAt).getTime(),
  );
  // If pre-join summary exists, createdAt must be unchanged
  if (preSummary) {
    typia.assert(preSummary);
    TestValidator.equals(
      "createdAt should remain unchanged compared to pre-update summary",
      updated1.createdAt,
      preSummary.created_at,
    );
  }

  // 4) Clear displayName to null and verify persistence
  const updateBody2 = {
    displayName: null,
  } satisfies ICommunityPlatformUser.IUpdate;

  const updated2: ICommunityPlatformUser =
    await api.functional.communityPlatform.registeredMember.users.update(
      connection,
      {
        userId: principalId,
        body: updateBody2,
      },
    );
  typia.assert(updated2);

  TestValidator.equals(
    "displayName should be cleared to null",
    updated2.displayName,
    null,
  );
  TestValidator.equals(
    "id must still match principal id after second update",
    updated2.id,
    principalId,
  );
}
