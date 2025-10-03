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
import type { IECommunityPlatformCommunityRuleSortBy } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformCommunityRuleSortBy";
import type { IESortOrder } from "@ORGANIZATION/PROJECT-api/lib/structures/IESortOrder";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformCommunityRule } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformCommunityRule";

/**
 * Validate deterministic, gap-free community rules listing and page head
 * equivalence.
 *
 * Scenario (cursor-less continuation by equivalence due to DTO constraints):
 *
 * 1. Join as a registered member to get an authenticated session.
 * 2. Create a community with a valid name and category.
 * 3. Seed 25 rules using order=1..25 with short text.
 * 4. Fetch first page with limit=20 sorted by order asc.
 * 5. Fetch full list with a large limit (100) under the same ordering.
 * 6. Assert that the first page equals the head of the full list; verify no
 *    duplicates and contiguous orderIndex (1..N) with no gaps; validate
 *    pagination counts coherence.
 */
export async function test_api_community_rules_pagination_cursor_continuation(
  connection: api.IConnection,
) {
  // 1) Join as a registered member
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const username: string = RandomGenerator.name(1).replace(/\s+/g, "");
  const authorized = await api.functional.auth.registeredMember.join(
    connection,
    {
      body: {
        email,
        username,
        password: `p@ss-${RandomGenerator.alphaNumeric(8)}`,
        displayName: RandomGenerator.name(2),
        client: {
          userAgent: "e2e-test-agent",
          clientPlatform: "node-e2e",
        },
      } satisfies ICommunityPlatformRegisteredMember.IJoin,
    },
  );
  typia.assert(authorized);

  // 2) Create a community (name follows pattern: start/end alnum, length 3-30, middle [A-Za-z0-9_-])
  const communityName = `c-${RandomGenerator.alphaNumeric(10)}-${RandomGenerator.alphaNumeric(3)}`; // starts with 'c', ends alnum
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
  const community: ICommunityPlatformCommunity =
    await api.functional.communityPlatform.registeredMember.communities.create(
      connection,
      {
        body: {
          name: communityName,
          category: RandomGenerator.pick(categories),
          description: RandomGenerator.paragraph({ sentences: 8 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);
  TestValidator.equals(
    "created community name equals input",
    community.name,
    communityName,
  );

  // 3) Seed N=25 rules in ascending order
  const RULE_COUNT = 25;
  for (let i = 1; i <= RULE_COUNT; i++) {
    const created: ICommunityPlatformCommunityRule =
      await api.functional.communityPlatform.registeredMember.communities.rules.create(
        connection,
        {
          communityName: community.name,
          body: {
            order: i,
            text: `Rule ${i}: ${RandomGenerator.paragraph({ sentences: 6 })}`.slice(
              0,
              90,
            ),
          } satisfies ICommunityPlatformCommunityRule.ICreate,
        },
      );
    typia.assert(created);
    TestValidator.equals(
      `created rule #${i} has matching orderIndex`,
      created.orderIndex,
      i,
    );
  }

  // 4) Fetch first page: limit=20, order asc by orderIndex
  const page1 = await api.functional.communityPlatform.communities.rules.index(
    connection,
    {
      communityName: community.name,
      body: {
        limit: 20 satisfies number as number,
        sortBy: "order",
        order: "asc",
      } satisfies ICommunityPlatformCommunityRule.IRequest,
    },
  );
  typia.assert(page1);

  // 5) Fetch full list: set a large limit to cover all
  const full = await api.functional.communityPlatform.communities.rules.index(
    connection,
    {
      communityName: community.name,
      body: {
        limit: 100 satisfies number as number,
        sortBy: "order",
        order: "asc",
      } satisfies ICommunityPlatformCommunityRule.IRequest,
    },
  );
  typia.assert(full);

  // 6) Validations
  // 6-1) First page size equals min(limit, total)
  const expectedPage1Length = Math.min(20, full.data.length);
  TestValidator.equals(
    "first page length equals min(limit, total)",
    page1.data.length,
    expectedPage1Length,
  );
  TestValidator.equals(
    "page1.pagination.limit equals requested limit",
    page1.pagination.limit,
    20,
  );

  // 6-2) First page equals head of full list (deterministic ordering)
  const headOfFull = full.data.slice(0, page1.data.length);
  TestValidator.equals(
    "page1 equals head of full list (order asc)",
    page1.data,
    headOfFull,
  );

  // 6-3) No duplicate ids in full list
  const fullIds = full.data.map((r) => r.id);
  const uniqueCount = new Set(fullIds).size;
  TestValidator.equals(
    "no duplicate rule ids in full list",
    uniqueCount,
    fullIds.length,
  );

  // 6-4) orderIndex is contiguous 1..N with no gaps
  const contiguous = full.data.every((r, idx) => r.orderIndex === idx + 1);
  TestValidator.predicate(
    "orderIndex is contiguous 1..N with no gaps",
    contiguous,
  );

  // 6-5) Ensure first page items do not overlap with the remaining tail beyond their own set
  const page1Ids = new Set(page1.data.map((r) => r.id));
  const tail = full.data.slice(page1.data.length);
  const overlap = ArrayUtil.has(
    tail.map((r) => r.id),
    (id) => page1Ids.has(id),
  );
  TestValidator.predicate(
    "no overlap between page1 and tail of full list",
    overlap === false,
  );

  // 6-6) Pagination math coherence (records, pages)
  const expectedPages = Math.max(
    1,
    Math.ceil(full.pagination.records / Math.max(1, full.pagination.limit)),
  );
  TestValidator.equals(
    "pagination pages equals ceil(records/limit)",
    full.pagination.pages,
    expectedPages,
  );
}
