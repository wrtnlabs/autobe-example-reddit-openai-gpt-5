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
 * Guest-guard for community creation, then resume after join (registration).
 *
 * Purpose:
 *
 * - Verify that creating a community without authentication fails.
 * - After registering a new member (join), retrying the same request succeeds.
 * - Verify uniqueness by attempting to create the same community again and
 *   expecting an error.
 *
 * Steps:
 *
 * 1. Build a valid ICommunityPlatformCommunity.ICreate body with a unique name and
 *    a valid category. Include a couple of short initial rules.
 * 2. Create an unauthenticated connection (empty headers) and attempt to create
 *    the community; expect an error.
 * 3. Register (join) a new member; SDK will attach Authorization token onto the
 *    original connection.
 * 4. Retry the same community creation on the authenticated connection; expect
 *    success and assert core fields.
 * 5. Attempt to create the same community again; expect an error to confirm
 *    uniqueness enforcement.
 */
export async function test_api_community_creation_unauthenticated_guard_then_resume(
  connection: api.IConnection,
) {
  // Prepare a unique, regex-safe community name: starts/ends alphanumeric, 3-30 chars
  const uniqueSuffix = RandomGenerator.alphaNumeric(10);
  const communityName = `e2e${uniqueSuffix}`; // alphanumeric only -> safe for pattern

  // Pick a valid category (enum literal)
  const category = "Tech & Programming";

  // Optional concise description within 500 chars
  const description = RandomGenerator.paragraph({ sentences: 6 });

  // Optional initial rules: short texts (<= 100 chars)
  const initialRules = [
    { order: 1, text: "Be respectful to others." },
    { order: 2, text: "No spam or self-promotion without permission." },
  ] satisfies ICommunityPlatformCommunityRule.ICreateArray;

  // Request body for community creation
  const createBody = {
    name: communityName,
    category,
    description,
    rules: initialRules,
  } satisfies ICommunityPlatformCommunity.ICreate;

  // 1) Unauthenticated attempt using a fresh connection with empty headers
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "guest cannot create community (unauthenticated guard)",
    async () => {
      await api.functional.communityPlatform.registeredMember.communities.create(
        unauthConn,
        { body: createBody },
      );
    },
  );

  // 2) Join (register) a new member to obtain authentication
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    username: RandomGenerator.name(1),
    password: RandomGenerator.alphaNumeric(12),
    displayName: RandomGenerator.name(),
    client: {
      userAgent: `e2e/${RandomGenerator.alphaNumeric(6)}`,
      ip: "127.0.0.1",
      clientPlatform: "node-e2e",
      clientDevice: "automation",
      sessionType: "standard",
    },
  } satisfies ICommunityPlatformRegisteredMember.IJoin;
  const auth = await api.functional.auth.registeredMember.join(connection, {
    body: joinBody,
  });
  typia.assert(auth);

  // 3) Retry creation with authenticated connection - expect success
  const created =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      { body: createBody },
    );
  typia.assert(created);

  // Validate core fields match request
  TestValidator.equals(
    "created community name equals request.name",
    created.name,
    createBody.name,
  );
  TestValidator.equals(
    "created community category equals request.category",
    created.category,
    category,
  );

  // 4) Attempt duplicate creation with same name - expect error
  await TestValidator.error(
    "duplicate community name cannot be created again",
    async () => {
      await api.functional.communityPlatform.registeredMember.communities.create(
        connection,
        { body: createBody },
      );
    },
  );
}
