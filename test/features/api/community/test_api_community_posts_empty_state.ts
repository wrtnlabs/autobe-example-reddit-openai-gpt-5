import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IClientContext } from "@ORGANIZATION/PROJECT-api/lib/structures/IClientContext";
import type { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";
import type { ICommunityPlatformCommunityRule } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityRule";
import type { ICommunityPlatformCommunityRuleArray } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityRuleArray";
import type { ICommunityPlatformPost } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformPost";
import type { ICommunityPlatformRegisteredMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRegisteredMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";
import type { ICommunityRef } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityRef";
import type { IECommunityCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityCategory";
import type { IECommunityPlatformCommunityCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformCommunityCategory";
import type { IEPostSort } from "@ORGANIZATION/PROJECT-api/lib/structures/IEPostSort";
import type { IEVoteState } from "@ORGANIZATION/PROJECT-api/lib/structures/IEVoteState";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformPost } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformPost";
import type { IUserRef } from "@ORGANIZATION/PROJECT-api/lib/structures/IUserRef";

/**
 * Verify empty posts listing for a newly created community (public access).
 *
 * Business goal: After creating a community and before creating any posts,
 * listing that community's posts should return an empty dataset. Also verify
 * that the listing endpoint is publicly accessible (no auth header required).
 *
 * Steps:
 *
 * 1. Register a new member via /auth/registeredMember/join
 * 2. Create a new community via POST
 *    /communityPlatform/registeredMember/communities
 * 3. Call PATCH /communityPlatform/communities/{communityName}/posts with
 *    sort=newest using an unauthenticated connection
 * 4. Validate empty list and pagination semantics (records=0, pages=0). When in
 *    simulation mode, only validate types
 */
export async function test_api_community_posts_empty_state(
  connection: api.IConnection,
) {
  // 1) Register a member (SDK will attach Authorization header on the connection)
  const joinOutput = await api.functional.auth.registeredMember.join(
    connection,
    {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        username: `user_${RandomGenerator.alphaNumeric(10)}`,
        password: `Pw1${RandomGenerator.alphaNumeric(12)}`,
      } satisfies ICommunityPlatformRegisteredMember.IJoin,
    },
  );
  typia.assert(joinOutput);

  // 2) Create a new community with a unique valid name and category
  const communityName = `e2e_${RandomGenerator.alphaNumeric(8)}`; // starts/ends with alphanumeric; includes underscore inside
  const categories = [
    "Tech & Programming",
    "Science",
    "Movies & TV",
    "Games",
    "Sports",
    "Lifestyle & Wellness",
    "Study & Education",
    "Art & Design",
    "Business & Finance",
    "News & Current Affairs",
  ] as const;
  const createCommunityBody = {
    name: communityName,
    category: RandomGenerator.pick(categories),
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      { body: createCommunityBody },
    );
  typia.assert(community);
  TestValidator.equals(
    "created community name matches requested name",
    community.name,
    communityName,
  );

  // 3) Build a public (unauthenticated) connection and list posts with sort=newest
  const publicConn: api.IConnection = { ...connection, headers: {} };
  const page = await api.functional.communityPlatform.communities.posts.index(
    publicConn,
    {
      communityName: communityName,
      body: { sort: "newest" } satisfies ICommunityPlatformPost.IRequest,
    },
  );
  typia.assert(page);

  // 4) Validate empty list and pagination semantics when not simulating
  if (connection.simulate !== true) {
    TestValidator.equals(
      "newly created community should have zero posts",
      page.data.length,
      0,
    );
    TestValidator.equals(
      "pagination.records should be zero for empty list",
      page.pagination.records,
      0,
    );
    TestValidator.equals(
      "pagination.pages should be zero for empty list",
      page.pagination.pages,
      0,
    );
    TestValidator.predicate(
      "pagination.limit must be positive",
      page.pagination.limit > 0,
    );
  }
}
