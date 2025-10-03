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
import type { IECommunityCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityCategory";
import type { IECommunityPlatformCommunityCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformCommunityCategory";
import type { IECommunityPlatformVoteState } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformVoteState";

/**
 * Guest guard for post creation and resume-after-sign-in.
 *
 * Business goal
 *
 * - Ensure unauthenticated users cannot create posts and receive an error.
 * - After sign-up, retry the exact same post payload and ensure creation
 *   succeeds.
 *
 * Steps
 *
 * 1. Join as a setup user to get an authenticated session for creating a community
 *    fixture.
 * 2. Create a community with a valid name and category.
 * 3. Prepare a valid post creation payload targeting that community.
 * 4. Attempt to create the post with an unauthenticated connection → expect an
 *    error (guest guard).
 * 5. Join as a new registered member (User A) to switch session.
 * 6. Retry the identical post creation payload → expect success, validate echo
 *    fields and relations.
 */
export async function test_api_post_creation_guest_guard_resume_after_sign_in(
  connection: api.IConnection,
) {
  // 1) Setup user joins (to create a community fixture)
  const setupJoin = await api.functional.auth.registeredMember.join(
    connection,
    {
      body: {
        email: typia.random<string & tags.Format<"email">>(),
        username: `setup_${RandomGenerator.alphaNumeric(8)}`,
        password: "P@ssw0rd!123",
        displayName: RandomGenerator.name(),
      } satisfies ICommunityPlatformRegisteredMember.IJoin,
    },
  );
  typia.assert(setupJoin);

  // Generate a compliant community name: starts with alpha, contains underscore, ends alphanumeric, length <= 30
  const communityName: string = `ggp_${RandomGenerator.alphaNumeric(12)}`;

  // 2) Create a community
  const createCommunityBody = {
    name: communityName,
    category: RandomGenerator.pick([
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
    ] as const),
    description: RandomGenerator.paragraph({ sentences: 12 }),
    rules: [
      { order: 1, text: RandomGenerator.paragraph({ sentences: 5 }) },
      { order: 2, text: RandomGenerator.paragraph({ sentences: 4 }) },
    ],
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      { body: createCommunityBody },
    );
  typia.assert(community);
  TestValidator.equals(
    "community name should match requested name",
    community.name,
    communityName,
  );

  // 3) Prepare post creation payload
  const postBody = {
    communityName,
    title: RandomGenerator.paragraph({ sentences: 8 }),
    body: RandomGenerator.content({
      paragraphs: 1,
      sentenceMin: 10,
      sentenceMax: 20,
    }),
    authorDisplayName: RandomGenerator.name(1),
  } satisfies ICommunityPlatformPost.ICreate;

  // 4) Attempt post creation without authentication → must error
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "guest cannot create post; authentication required",
    async () => {
      await api.functional.communityPlatform.registeredMember.posts.create(
        unauthConn,
        { body: postBody },
      );
    },
  );

  // 5) Join as a new registered member (User A) to switch session
  const userA = await api.functional.auth.registeredMember.join(connection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      username: `userA_${RandomGenerator.alphaNumeric(8)}`,
      password: "P@ssw0rd!123",
      displayName: RandomGenerator.name(),
    } satisfies ICommunityPlatformRegisteredMember.IJoin,
  });
  typia.assert(userA);

  // 6) Retry the same post payload → should succeed
  const created =
    await api.functional.communityPlatform.registeredMember.posts.create(
      connection,
      { body: postBody },
    );
  typia.assert(created);

  // Business validations: community linkage and echo fields
  TestValidator.equals(
    "created post should reference the target community by name",
    created.community.name,
    communityName,
  );
  TestValidator.equals(
    "created post title should equal requested title",
    created.title,
    postBody.title,
  );
  TestValidator.equals(
    "created post body should equal requested body",
    created.body,
    postBody.body,
  );
}
