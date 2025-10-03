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
 * Deleted posts are not retrievable by public GET.
 *
 * Workflow
 *
 * 1. Join as a registered member (auth token set by SDK).
 * 2. Create a community with a unique, regex-compliant name and valid category.
 * 3. Create a post in that community; capture post id.
 * 4. Delete the post via the registered-member endpoint (author-only).
 * 5. Using an unauthenticated connection, attempt public GET by id and expect an
 *    error (not-found semantics).
 *
 * Acceptance criteria
 *
 * - Post is created under the expected community (name match).
 * - After deletion, public GET throws an error.
 * - No HTTP status code assertions; only error expectation is validated.
 */
export async function test_api_post_detail_not_found_after_delete(
  connection: api.IConnection,
) {
  // 1) Join as a registered member
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const username: string = `user_${RandomGenerator.alphaNumeric(8)}`;
  const password: string = `Pw_${RandomGenerator.alphaNumeric(12)}`;

  const authorized: ICommunityPlatformRegisteredMember.IAuthorized =
    await api.functional.auth.registeredMember.join(connection, {
      body: {
        email,
        username,
        password,
      } satisfies ICommunityPlatformRegisteredMember.IJoin,
    });
  typia.assert(authorized);

  // 2) Create a community with a unique, regex-compliant name
  const communityName: string = `e2e-${RandomGenerator.alphaNumeric(8)}a`; // starts with letter, ends with alphanumeric
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

  const community: ICommunityPlatformCommunity =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      {
        body: {
          name: communityName,
          category,
          description: RandomGenerator.paragraph({ sentences: 8 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);

  // 3) Create a post in the community
  const createPostBody = {
    communityName: community.name,
    title: RandomGenerator.paragraph({ sentences: 6 }),
    body: RandomGenerator.content({
      paragraphs: 2,
      sentenceMin: 10,
      sentenceMax: 15,
      wordMin: 3,
      wordMax: 8,
    }),
  } satisfies ICommunityPlatformPost.ICreate;

  const post: ICommunityPlatformPost =
    await api.functional.communityPlatform.registeredMember.posts.create(
      connection,
      { body: createPostBody },
    );
  typia.assert(post);

  // Verify post was created under the requested community
  TestValidator.equals(
    "post should be created under the requested community",
    post.community.name,
    community.name,
  );

  // 4) Delete the post as the author
  await api.functional.communityPlatform.registeredMember.posts.erase(
    connection,
    { postId: post.id },
  );

  // 5) Public GET by id should fail after deletion (use unauthenticated connection)
  const unauthConn: api.IConnection = { ...connection, headers: {} };
  await TestValidator.error(
    "deleted post should not be retrievable anymore (public GET fails)",
    async () => {
      await api.functional.communityPlatform.posts.at(unauthConn, {
        postId: post.id,
      });
    },
  );
}
