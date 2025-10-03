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
 * Verify public retrieval returns not-found after owner deletes a community.
 *
 * Steps:
 *
 * 1. Register a new member (owner context) to obtain an authenticated session
 * 2. Create a community with a valid immutable name and category
 * 3. Delete the community by its immutable name
 * 4. Try to fetch the community publicly and expect an error (not-found)
 *
 * Notes:
 *
 * - Do not check specific HTTP status codes; only assert that an error occurs.
 * - Use typia.assert on all non-void API responses for perfect type validation.
 */
export async function test_api_community_detail_not_found_after_deletion(
  connection: api.IConnection,
) {
  // 1) Register a new member (owner context)
  const email = typia.random<string & tags.Format<"email">>();
  const username = RandomGenerator.alphaNumeric(12);
  const password = RandomGenerator.alphaNumeric(12);

  const auth = await api.functional.auth.registeredMember.join(connection, {
    body: {
      email,
      username,
      password,
      displayName: RandomGenerator.name(),
      client: {
        userAgent: "e2e/community/delete",
        clientPlatform: "node",
        sessionType: "standard",
      },
    } satisfies ICommunityPlatformRegisteredMember.IJoin,
  });
  typia.assert(auth);

  // 2) Create a community with a valid name and category
  const namePrefix = RandomGenerator.alphabets(5);
  const nameSuffix = RandomGenerator.alphaNumeric(6); // still alphanumeric
  const communityName = `${namePrefix}-${nameSuffix}`; // starts/ends alphanumeric, includes hyphen

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

  const initialRules = [
    {
      order: 1,
      text: RandomGenerator.paragraph({ sentences: 5 }),
    },
    {
      order: 2,
      text: RandomGenerator.paragraph({ sentences: 4 }),
    },
  ] satisfies ICommunityPlatformCommunityRule.ICreateArray;

  const created =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      {
        body: {
          name: communityName,
          category,
          description: RandomGenerator.paragraph({ sentences: 10 }),
          rules: initialRules,
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(created);
  TestValidator.equals(
    "created community name should match input",
    created.name,
    communityName,
  );

  // 3) Delete the community by its immutable name
  const taggedNameForErase = typia.assert<
    string &
      tags.MinLength<3> &
      tags.MaxLength<30> &
      tags.Pattern<"^[A-Za-z0-9](?:[A-Za-z0-9_-]{1,28}[A-Za-z0-9])?$">
  >(communityName);
  await api.functional.communityPlatform.registeredMember.communities.erase(
    connection,
    {
      communityName: taggedNameForErase,
    },
  );

  // 4) Fetch publicly and expect an error (not-found), no status-code assertion
  const taggedNameForGet = typia.assert<
    string &
      tags.MinLength<3> &
      tags.MaxLength<30> &
      tags.Pattern<"^[A-Za-z0-9](?:[A-Za-z0-9_-]{1,28}[A-Za-z0-9])?$">
  >(communityName);
  await TestValidator.error(
    "fetching deleted community should fail",
    async () => {
      await api.functional.communityPlatform.communities.at(connection, {
        communityName: taggedNameForGet,
      });
    },
  );
}
