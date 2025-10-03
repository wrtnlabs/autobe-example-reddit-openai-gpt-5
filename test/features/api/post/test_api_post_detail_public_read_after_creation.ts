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
 * Public post detail is readable without authentication immediately after
 * creation.
 *
 * Business flow
 *
 * 1. Register a member to obtain an authenticated context (SDK manages token).
 * 2. Create a community (valid name pattern and category selection).
 * 3. Create a post in the community and capture postId.
 * 4. Using an unauthenticated connection, GET the post detail by id.
 * 5. Validate core fields and aggregates (score/commentCount = 0), and that myVote
 *    is null/undefined for guests.
 */
export async function test_api_post_detail_public_read_after_creation(
  connection: api.IConnection,
) {
  // 1) Register a member (authenticated context for setup)
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    username: RandomGenerator.name(1).replace(/\s+/g, ""),
    password: RandomGenerator.alphaNumeric(12),
    displayName: RandomGenerator.name(1),
    client: {
      userAgent: "e2e-post-public-read",
      clientPlatform: "e2e",
      sessionType: "standard",
    },
  } satisfies ICommunityPlatformRegisteredMember.IJoin;
  const me: ICommunityPlatformRegisteredMember.IAuthorized =
    await api.functional.auth.registeredMember.join(connection, {
      body: joinBody,
    });
  typia.assert(me);

  // 2) Create a community
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
  ] as const satisfies readonly IECommunityCategory[];
  const communityName: string = `e2e_${RandomGenerator.alphaNumeric(12)}`;
  const communityBody = {
    name: communityName,
    category: RandomGenerator.pick(categories),
    description: RandomGenerator.paragraph({ sentences: 10 }),
    rules: [
      { order: 1, text: RandomGenerator.paragraph({ sentences: 5 }) },
      { order: 2, text: RandomGenerator.paragraph({ sentences: 5 }) },
    ],
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community: ICommunityPlatformCommunity =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      { body: communityBody },
    );
  typia.assert(community);
  TestValidator.equals(
    "community name should match the requested name",
    community.name,
    communityName,
  );

  // 3) Create a post
  const title = RandomGenerator.paragraph({ sentences: 6 }); // ~6 words (>=5)
  const body = RandomGenerator.content({
    paragraphs: 1,
    sentenceMin: 12,
    sentenceMax: 20,
  });
  const postBody = {
    communityName: community.name,
    title,
    body,
    authorDisplayName: RandomGenerator.name(1),
  } satisfies ICommunityPlatformPost.ICreate;
  const created: ICommunityPlatformPost =
    await api.functional.communityPlatform.registeredMember.posts.create(
      connection,
      { body: postBody },
    );
  typia.assert(created);
  TestValidator.equals(
    "created post belongs to the expected community",
    created.community.name,
    community.name,
  );
  TestValidator.equals(
    "created post initial score should be zero",
    created.score,
    0,
  );
  TestValidator.equals(
    "created post initial commentCount should be zero",
    created.commentCount,
    0,
  );

  // 4) Read the post without authentication (guest)
  const guestConnection: api.IConnection = { ...connection, headers: {} };
  const readGuest: ICommunityPlatformPost =
    await api.functional.communityPlatform.posts.at(guestConnection, {
      postId: created.id,
    });
  typia.assert(readGuest);

  // 5) Validate public read invariants
  TestValidator.equals(
    "guest read returns the same post id",
    readGuest.id,
    created.id,
  );
  TestValidator.equals(
    "guest read returns same community name",
    readGuest.community.name,
    community.name,
  );
  TestValidator.equals(
    "guest read echoes the same title",
    readGuest.title,
    created.title,
  );
  TestValidator.equals("guest read initial score is zero", readGuest.score, 0);
  TestValidator.equals(
    "guest read initial commentCount is zero",
    readGuest.commentCount,
    0,
  );
  TestValidator.predicate(
    "guest read myVote should be null or undefined",
    readGuest.myVote === null || readGuest.myVote === undefined,
  );
}
