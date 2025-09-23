import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { ICommunityPlatformUserProfile } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUserProfile";

export async function test_api_user_profile_public_read_success_preseeded(
  connection: api.IConnection,
) {
  // Resolve userId depending on environment (simulate vs real backend)
  const envUserId: string | undefined = process.env.E2E_PRESEEDED_USER_ID;
  if (connection.simulate !== true) {
    // Require env var on real backend to ensure a real, pre-seeded UUID
    if (envUserId === undefined || envUserId.length === 0)
      throw new Error(
        "E2E_PRESEEDED_USER_ID is not set. Please configure a pre-seeded user UUID for real backend runs.",
      );
  }
  const userId: string & tags.Format<"uuid"> =
    connection.simulate === true
      ? typia.random<string & tags.Format<"uuid">>()
      : typia.assert<string & tags.Format<"uuid">>(envUserId!);

  // Call the public profile read API
  const profile: ICommunityPlatformUserProfile =
    await api.functional.communityPlatform.users.profile.at(connection, {
      userId,
    });
  // Full type/schema validation
  typia.assert(profile);

  // Business validations
  TestValidator.equals(
    "profile belongs to the requested userId",
    profile.community_platform_user_id,
    userId,
  );
  TestValidator.predicate(
    "profile is active (not soft-deleted)",
    profile.deleted_at === null || profile.deleted_at === undefined,
  );
}
