import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCategory";
import type { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformReservedTerm } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformReservedTerm";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";
import type { IECategorySortBy } from "@ORGANIZATION/PROJECT-api/lib/structures/IECategorySortBy";
import type { IESortDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IESortDirection";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformCategory";
import type { IPageICommunityPlatformReservedTerm } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformReservedTerm";

/**
 * Validate reserved-term blocking for community creation.
 *
 * Business goal:
 *
 * - When an authenticated community member attempts to create a community with a
 *   name that is reserved for the 'community_name' context, creation must be
 *   rejected. The check must be case-insensitive.
 *
 * Test flow:
 *
 * 1. Join as a community member (auth token attached automatically by SDK).
 * 2. List categories (active=true) and pick a valid category id.
 * 3. List reserved terms (applies_to='community_name', active=true), pick one that
 *    already satisfies the name format constraints.
 * 4. Attempt to create a community with the reserved name (case-varied) and expect
 *    an error (business logic rejection).
 * 5. If no suitable reserved term exists, create a valid community name as a
 *    positive control and assert success (name, category id, ownership).
 */
export async function test_api_community_creation_reserved_term_blocked(
  connection: api.IConnection,
) {
  // 1) Join as a community member
  const joinBody = {
    username: `user_${RandomGenerator.alphaNumeric(10)}`,
    email: typia.random<string & tags.Format<"email">>(),
    password: `P${RandomGenerator.alphaNumeric(11)}`, // ensure length >= 8
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const authorized = await api.functional.auth.communityMember.join(
    connection,
    {
      body: joinBody,
    },
  );
  typia.assert(authorized);

  // 2) Fetch categories and pick a valid category id
  const catReq = {
    page: 1,
    limit: 50,
    active: true,
    sortBy: "display_order",
    direction: "asc",
  } satisfies ICommunityPlatformCategory.IRequest;
  const categoriesPage =
    await api.functional.communityPlatform.categories.index(connection, {
      body: catReq,
    });
  typia.assert(categoriesPage);
  TestValidator.predicate(
    "at least one category must exist to create a community",
    categoriesPage.data.length > 0,
  );
  const category =
    categoriesPage.data.find((c) => c.active === true) ??
    categoriesPage.data[0];
  const categoryId = category.id;

  // 3) Fetch reserved terms for community_name
  const reservedReq = {
    page: 1,
    limit: 100,
    applies_to: "community_name",
    active: true,
    sort_by: "created_at",
    sort_dir: "asc",
  } satisfies ICommunityPlatformReservedTerm.IRequest;
  const reservedPage =
    await api.functional.communityPlatform.reservedTerms.index(connection, {
      body: reservedReq,
    });
  typia.assert(reservedPage);

  // Allowed name pattern from ICommunityPlatformCommunity.ICreate.name
  const allowedNamePattern = /^[A-Za-z][A-Za-z0-9_-]{1,30}[A-Za-z0-9]$/;
  const candidate = reservedPage.data.find(
    (t) =>
      t.applies_to === "community_name" &&
      t.active === true &&
      allowedNamePattern.test(t.term) &&
      t.term.length >= 3 &&
      t.term.length <= 32,
  );

  if (candidate) {
    // 4) Negative path: attempt creation with a reserved name (case-insensitive)
    const variations = [
      candidate.term.toLowerCase(),
      candidate.term.toUpperCase(),
      candidate.term[0].toUpperCase() + candidate.term.slice(1).toLowerCase(),
    ] as const;
    const reservedName = RandomGenerator.pick(variations);

    const badCreateBody = {
      name: reservedName,
      community_platform_category_id: categoryId,
    } satisfies ICommunityPlatformCommunity.ICreate;

    await TestValidator.error(
      "creating a community with a reserved name must be rejected",
      async () => {
        await api.functional.communityPlatform.communityMember.communities.create(
          connection,
          { body: badCreateBody },
        );
      },
    );
  } else {
    // 5) Fallback positive control: create a community with a valid non-reserved name
    const makeValidName = (): string => {
      // Iterative generator to avoid recursion; ensures compliance with pattern
      for (let i = 0; i < 100; i++) {
        const start = String.fromCharCode(
          "a".charCodeAt(0) + Math.floor(Math.random() * 26),
        );
        const midLength = 6 + Math.floor(Math.random() * 8); // 6..13
        const midChars = ArrayUtil.repeat(midLength, () => {
          const pools = [
            () =>
              String.fromCharCode(
                "a".charCodeAt(0) + Math.floor(Math.random() * 26),
              ),
            () =>
              String.fromCharCode(
                "0".charCodeAt(0) + Math.floor(Math.random() * 10),
              ),
            () => "_",
            () => "-",
          ] as const;
          return RandomGenerator.pick(pools)();
        }).join("");
        const tailOptions = [
          () =>
            String.fromCharCode(
              "a".charCodeAt(0) + Math.floor(Math.random() * 26),
            ),
          () =>
            String.fromCharCode(
              "0".charCodeAt(0) + Math.floor(Math.random() * 10),
            ),
        ] as const;
        const end = RandomGenerator.pick(tailOptions)();
        const value = `${start}${midChars}${end}`;
        if (allowedNamePattern.test(value)) return value;
      }
      // As a last resort, return a fixed compliant value
      return "alpha_1x"; // 7+ chars but we need 3–32 and pattern compliant
    };

    const goodName = makeValidName();
    const goodCreateBody = {
      name: goodName,
      community_platform_category_id: categoryId,
    } satisfies ICommunityPlatformCommunity.ICreate;

    const created =
      await api.functional.communityPlatform.communityMember.communities.create(
        connection,
        { body: goodCreateBody },
      );
    typia.assert(created);

    TestValidator.equals(
      "created community name should equal input name",
      created.name,
      goodName,
    );
    TestValidator.equals(
      "created community should link selected category id",
      created.community_platform_category_id,
      categoryId,
    );
    TestValidator.equals(
      "owner id should equal authenticated subject id",
      created.community_platform_user_id,
      authorized.id,
    );
  }
}
