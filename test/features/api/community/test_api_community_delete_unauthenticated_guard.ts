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
 * Guest guard on community deletion with resume-after-login flow.
 *
 * Steps:
 *
 * 1. Try deleting a community while unauthenticated → expect an error (guest
 *    guard)
 * 2. Join (register) a member; token is bound to the connection by the SDK
 * 3. Create the community with the same target name
 * 4. Delete the community successfully as the authenticated owner
 * 5. Re-delete attempt should error, confirming deletion
 */
export async function test_api_community_delete_unauthenticated_guard(
  connection: api.IConnection,
) {
  // Prepare a valid community name (regex: starts/ends alphanumeric, allows _ and - inside)
  const communityName: string = RandomGenerator.alphaNumeric(12);

  // 1) Unauthenticated delete should be guarded
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error("unauthenticated delete is guarded", async () => {
    await api.functional.communityPlatform.registeredMember.communities.erase(
      unauthConn,
      { communityName },
    );
  });

  // 2) Join (register) a member; SDK attaches Authorization to the given connection
  const authorized = await api.functional.auth.registeredMember.join(
    connection,
    {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        username: RandomGenerator.name(1),
        password: RandomGenerator.alphaNumeric(12),
        // displayName is optional; include for realism
        displayName: RandomGenerator.name(1),
      } satisfies ICommunityPlatformRegisteredMember.IJoin,
    },
  );
  typia.assert(authorized);

  // 3) Create the community with the target name
  const created =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      {
        body: {
          name: communityName,
          category: "Tech & Programming",
          description: RandomGenerator.paragraph({ sentences: 8 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(created);
  TestValidator.equals(
    "created community name matches requested name",
    created.name,
    communityName,
  );
  if (created.isOwner !== undefined) {
    TestValidator.predicate(
      "creator is recognized as owner when field is present",
      created.isOwner === true,
    );
  }

  // 4) Delete the community successfully as the owner
  await api.functional.communityPlatform.registeredMember.communities.erase(
    connection,
    { communityName },
  );

  // 5) Re-delete should fail (not-found or similar); we only expect an error, not a specific status
  await TestValidator.error(
    "deleting already-deleted community should error",
    async () => {
      await api.functional.communityPlatform.registeredMember.communities.erase(
        connection,
        { communityName },
      );
    },
  );
}
