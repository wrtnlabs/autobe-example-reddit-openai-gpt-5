import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IClientContext } from "@ORGANIZATION/PROJECT-api/lib/structures/IClientContext";
import type { ICommunityPlatformRegisteredMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRegisteredMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";
import type { IECommunityPlatformRegisteredMemberSort } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformRegisteredMemberSort";
import type { IEOrderDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IEOrderDirection";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformRegisteredMember } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformRegisteredMember";

export async function test_api_registered_member_assignment_search_member_forbidden(
  connection: api.IConnection,
) {
  /**
   * Verify a non-admin registered member cannot access admin-only registered
   * member listing.
   *
   * Steps:
   *
   * 1. Register and sign in a normal member via /auth/registeredMember/join
   * 2. Attempt to call admin-only PATCH
   *    /communityPlatform/siteAdmin/registeredMembers
   * 3. Expect an error (forbidden access) without asserting specific HTTP status
   *    codes
   */

  // 1) Register and sign in a normal member
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    username: RandomGenerator.alphabets(12),
    password: RandomGenerator.alphaNumeric(16),
    displayName: RandomGenerator.name(),
    client: {
      userAgent: "e2e-tests",
      ip: "127.0.0.1",
      clientPlatform: "node",
      clientDevice: "ci",
      sessionType: "standard",
    },
  } satisfies ICommunityPlatformRegisteredMember.IJoin;

  const authorized = await api.functional.auth.registeredMember.join(
    connection,
    {
      body: joinBody,
    },
  );
  typia.assert(authorized);

  // 2) Attempt to call admin-only index endpoint as a non-admin
  const adminIndexRequest = {
    // All fields optional; empty request focuses on authorization behavior
  } satisfies ICommunityPlatformRegisteredMember.IRequest;

  // 3) Expect an error (forbidden) — do not assert status codes per E2E rules
  await TestValidator.error(
    "non-admin member cannot access siteAdmin registeredMembers.index",
    async () => {
      await api.functional.communityPlatform.siteAdmin.registeredMembers.index(
        connection,
        { body: adminIndexRequest },
      );
    },
  );
}
