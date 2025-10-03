import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IClientContext } from "@ORGANIZATION/PROJECT-api/lib/structures/IClientContext";
import type { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";
import type { ICommunityPlatformCommunityRule } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityRule";
import type { ICommunityPlatformCommunityRuleArray } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityRuleArray";
import type { ICommunityPlatformRegisteredMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRegisteredMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";
import type { IECommunityCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityCategory";
import type { IECommunityPlatformCommunityCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformCommunityCategory";

/**
 * Guest guard for community update, then resume-after-login success.
 *
 * This test ensures that updating a community requires authentication and that
 * a guest (unauthenticated) attempt fails. It then authenticates a new member,
 * creates a community, and retries the update successfully, verifying that
 * mutable fields change while the name remains immutable.
 *
 * Steps:
 *
 * 1. Build a unique community name that satisfies the required pattern.
 * 2. Attempt to update the community WITHOUT authentication and expect an error.
 * 3. Join (register) as a member; SDK manages the Authorization token.
 * 4. Create a community with the prepared name.
 * 5. Update the community metadata and verify changes; ensure name is immutable.
 */
export async function test_api_community_update_unauthenticated_guard(
  connection: api.IConnection,
) {
  // 1) Prepare a unique community name satisfying the pattern
  const communityNameRaw = `e2e${RandomGenerator.alphaNumeric(12)}`; // starts with letter, only alnum
  const communityName = typia.assert<
    string &
      tags.MinLength<3> &
      tags.MaxLength<30> &
      tags.Pattern<"^[A-Za-z0-9](?:[A-Za-z0-9_-]{1,28}[A-Za-z0-9])?$">
  >(communityNameRaw);

  // 2) Guest guard: attempt update without authentication
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  const guestUpdateBody = {
    description: RandomGenerator.paragraph({ sentences: 8 }),
  } satisfies ICommunityPlatformCommunity.IUpdate;
  await TestValidator.error(
    "guest cannot update community (unauthenticated guard)",
    async () => {
      await api.functional.communityPlatform.registeredMember.communities.update(
        unauthConn,
        {
          communityName,
          body: guestUpdateBody,
        },
      );
    },
  );

  // 3) Authenticate (join) as a registered member
  const authorized = await api.functional.auth.registeredMember.join(
    connection,
    {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        username: `user_${RandomGenerator.alphaNumeric(8)}`,
        password: RandomGenerator.alphaNumeric(16),
        displayName: RandomGenerator.name(),
        client: undefined,
      } satisfies ICommunityPlatformRegisteredMember.IJoin,
    },
  );
  typia.assert(authorized);

  // 4) Create a community we own
  const initialDescription = RandomGenerator.paragraph({ sentences: 10 });
  const created =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      {
        body: {
          name: communityName,
          category: "Science",
          description: initialDescription,
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(created);

  // 5) Update community metadata after authentication
  const newDescription = RandomGenerator.paragraph({ sentences: 6 });
  const newCategory = "Games"; // different from initial to verify change
  const updated =
    await api.functional.communityPlatform.registeredMember.communities.update(
      connection,
      {
        communityName: created.name,
        body: {
          description: newDescription,
          category: newCategory,
        } satisfies ICommunityPlatformCommunity.IUpdate,
      },
    );
  typia.assert(updated);

  // Validate business expectations
  TestValidator.equals(
    "community name remains immutable after update",
    updated.name,
    created.name,
  );

  // Description was changed
  const updatedDesc = typia.assert<string>(updated.description!);
  TestValidator.equals(
    "updated description reflected in response",
    updatedDesc,
    newDescription,
  );

  // Category was changed
  TestValidator.equals(
    "updated category reflected in response",
    updated.category,
    newCategory,
  );
}
