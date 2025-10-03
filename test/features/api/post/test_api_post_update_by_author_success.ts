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
 * Update a post by its author: mutable fields change, immutable fields stay.
 *
 * Business flow:
 *
 * 1. Register (join) as a member → obtains authenticated session.
 * 2. Create a community to host the post.
 * 3. Create a post within that community; capture immutable references.
 * 4. Update the post (title/body/authorDisplayName) via PUT.
 * 5. Validate: title/body/authorDisplayName updated; updatedAt changed;
 *    id/community/author/createdAt unchanged; score/commentCount unaffected.
 */
export async function test_api_post_update_by_author_success(
  connection: api.IConnection,
) {
  // 1) Register (join) as author
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    username: `user_${RandomGenerator.alphaNumeric(8)}`,
    password: `P@ssw0rd_${RandomGenerator.alphaNumeric(6)}`,
    displayName: null,
    client: {
      userAgent: "e2e-test/registered-member",
      sessionType: "standard",
    },
  } satisfies ICommunityPlatformRegisteredMember.IJoin;
  const authorized = await api.functional.auth.registeredMember.join(
    connection,
    { body: joinBody },
  );
  typia.assert(authorized);

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
  ] as const;
  const communityBody = {
    name: `e2e-${RandomGenerator.alphaNumeric(10)}`,
    category: RandomGenerator.pick(categories),
    description: RandomGenerator.paragraph({ sentences: 8 }),
    rules: [
      {
        order: 1,
        text: RandomGenerator.paragraph({ sentences: 10 }).slice(0, 100),
      },
    ],
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      { body: communityBody },
    );
  typia.assert(community);

  // 3) Create a post in the community
  const initialTitle = RandomGenerator.paragraph({ sentences: 6 });
  const initialBody = RandomGenerator.content({
    paragraphs: 2,
    sentenceMin: 10,
    sentenceMax: 15,
    wordMin: 3,
    wordMax: 7,
  });
  const initialAuthorDisplayName = RandomGenerator.name(1);
  const postCreateBody = {
    communityName: community.name,
    title: initialTitle,
    body: initialBody,
    authorDisplayName: initialAuthorDisplayName,
  } satisfies ICommunityPlatformPost.ICreate;
  const created =
    await api.functional.communityPlatform.registeredMember.posts.create(
      connection,
      { body: postCreateBody },
    );
  typia.assert(created);

  // Capture immutable references for later comparison
  const originalId = created.id;
  const originalCommunityName = created.community.name;
  const originalAuthorId = created.author.id;
  const originalCreatedAt = created.createdAt;
  const originalUpdatedAt = created.updatedAt;
  const originalScore = created.score;
  const originalCommentCount = created.commentCount;

  // 4) Update mutable fields of the post
  const newTitle = RandomGenerator.paragraph({ sentences: 7 });
  const newBody = RandomGenerator.content({
    paragraphs: 3,
    sentenceMin: 8,
    sentenceMax: 12,
    wordMin: 3,
    wordMax: 7,
  });
  const newAuthorDisplayName = RandomGenerator.name(1);
  const updateBody = {
    title: newTitle,
    body: newBody,
    authorDisplayName: newAuthorDisplayName,
  } satisfies ICommunityPlatformPost.IUpdate;
  const updated =
    await api.functional.communityPlatform.registeredMember.posts.update(
      connection,
      {
        postId: created.id,
        body: updateBody,
      },
    );
  typia.assert(updated);

  // 5) Assertions: immutables unchanged, mutables updated, updatedAt changed
  TestValidator.equals("post id unchanged", updated.id, originalId);
  TestValidator.equals(
    "community name immutable",
    updated.community.name,
    originalCommunityName,
  );
  TestValidator.equals(
    "author id unchanged",
    updated.author.id,
    originalAuthorId,
  );
  TestValidator.equals(
    "createdAt unchanged",
    updated.createdAt,
    originalCreatedAt,
  );
  TestValidator.notEquals(
    "updatedAt changed after update",
    updated.updatedAt,
    originalUpdatedAt,
  );

  TestValidator.equals("title updated as requested", updated.title, newTitle);
  TestValidator.equals("body updated as requested", updated.body, newBody);
  TestValidator.equals(
    "author displayName updated as requested",
    updated.author.displayName,
    newAuthorDisplayName,
  );

  TestValidator.equals(
    "score unaffected by content edit",
    updated.score,
    originalScore,
  );
  TestValidator.equals(
    "commentCount unaffected by content edit",
    updated.commentCount,
    originalCommentCount,
  );
}
