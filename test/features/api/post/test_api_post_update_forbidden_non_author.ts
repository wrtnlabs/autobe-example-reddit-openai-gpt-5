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
 * Non-author cannot update another member’s post.
 *
 * Business intent: Ensure that the author-only guard is enforced when updating
 * a post. A different authenticated user (non-author) must not be able to
 * modify someone else’s post content.
 *
 * Steps:
 *
 * 1. Create two members via join: A (author) and B (other), on separate connection
 *    clones (SDK manages tokens).
 * 2. As A, create a community and a post; capture postId.
 * 3. As B, attempt to update A’s post; expect an error (ownership guard).
 * 4. Positive control: As A, update own post successfully and validate fields.
 */
export async function test_api_post_update_forbidden_non_author(
  connection: api.IConnection,
) {
  // Prepare two isolated connections for separate authenticated sessions
  const connA: api.IConnection = { ...connection, headers: {} };
  const connB: api.IConnection = { ...connection, headers: {} };

  // 1) Register member A (author)
  const emailA: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const joinA = await api.functional.auth.registeredMember.join(connA, {
    body: {
      email: emailA,
      username: `author_${RandomGenerator.alphaNumeric(8)}`,
      password: `Pw_${RandomGenerator.alphaNumeric(12)}`,
      displayName: RandomGenerator.name(1),
      client: {
        userAgent: `e2e/${RandomGenerator.alphaNumeric(6)}`,
      },
    } satisfies ICommunityPlatformRegisteredMember.IJoin,
  });
  typia.assert(joinA);

  // 2) As A, create a community
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
  const category = RandomGenerator.pick(categories);
  const communityName = `test${RandomGenerator.alphaNumeric(8)}`; // starts with alpha, ends alnum, len <= 30

  const community =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connA,
      {
        body: {
          name: communityName,
          category,
          description: RandomGenerator.paragraph({ sentences: 8 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);
  TestValidator.equals(
    "community name should echo input",
    community.name,
    communityName,
  );

  // 3) As A, create a post in the community
  const postCreate = {
    communityName,
    title: RandomGenerator.paragraph({ sentences: 5 }),
    body: RandomGenerator.content({
      paragraphs: 1,
      sentenceMin: 10,
      sentenceMax: 20,
      wordMin: 3,
      wordMax: 8,
    }),
  } satisfies ICommunityPlatformPost.ICreate;
  const post =
    await api.functional.communityPlatform.registeredMember.posts.create(
      connA,
      { body: postCreate },
    );
  typia.assert(post);
  TestValidator.equals(
    "post belongs to created community",
    post.community.name,
    communityName,
  );
  TestValidator.equals("post author equals member A", post.author.id, joinA.id);

  // 4) Register member B (non-author)
  const emailB: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const joinB = await api.functional.auth.registeredMember.join(connB, {
    body: {
      email: emailB,
      username: `other_${RandomGenerator.alphaNumeric(8)}`,
      password: `Pw_${RandomGenerator.alphaNumeric(12)}`,
      displayName: RandomGenerator.name(1),
      client: {
        userAgent: `e2e/${RandomGenerator.alphaNumeric(6)}`,
      },
    } satisfies ICommunityPlatformRegisteredMember.IJoin,
  });
  typia.assert(joinB);

  // 5) As B, attempt to update A’s post -> expect error (ownership guard)
  await TestValidator.error(
    "non-author cannot update someone else's post",
    async () => {
      await api.functional.communityPlatform.registeredMember.posts.update(
        connB,
        {
          postId: post.id,
          body: {
            title: RandomGenerator.paragraph({ sentences: 6 }),
          } satisfies ICommunityPlatformPost.IUpdate,
        },
      );
    },
  );

  // 6) Positive control: As A, can update own post successfully
  const newTitle = RandomGenerator.paragraph({ sentences: 6 });
  const updated =
    await api.functional.communityPlatform.registeredMember.posts.update(
      connA,
      {
        postId: post.id,
        body: { title: newTitle } satisfies ICommunityPlatformPost.IUpdate,
      },
    );
  typia.assert(updated);
  TestValidator.equals("post id should remain the same", updated.id, post.id);
  TestValidator.equals(
    "community should remain immutable",
    updated.community.name,
    communityName,
  );
  TestValidator.equals(
    "title should be updated by author",
    updated.title,
    newTitle,
  );
}
