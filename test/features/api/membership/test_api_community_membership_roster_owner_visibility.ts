import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformCommunityMembership } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMembership";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformCommunityMembership } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformCommunityMembership";

export async function test_api_community_membership_roster_owner_visibility(
  connection: api.IConnection,
) {
  /**
   * Validate owner-visible roster behavior:
   *
   * 1. Owner creates community
   * 2. Two members join the community
   * 3. Owner lists roster (active-only by default) and checks sorting/pagination
   *    determinism
   * 4. Owner ends one membership
   * 5. Owner lists again to see exclusion by default and inclusion when
   *    include_ended=true
   */

  // Prepare isolated connections for each actor (SDK will manage Authorization per-connection)
  const ownerConn: api.IConnection = { ...connection, headers: {} };
  const member1Conn: api.IConnection = { ...connection, headers: {} };
  const member2Conn: api.IConnection = { ...connection, headers: {} };

  // 1) Owner account (join/authenticate)
  const ownerAuth = await api.functional.auth.communityMember.join(ownerConn, {
    body: {
      username: `owner_${RandomGenerator.alphaNumeric(8)}`,
      email: typia.random<string & tags.Format<"email">>(),
      password: RandomGenerator.alphaNumeric(12),
    } satisfies ICommunityPlatformCommunityMember.ICreate,
  });
  typia.assert(ownerAuth);

  // 1-1) Owner creates a community
  const communityName = `c${RandomGenerator.alphaNumeric(10)}`; // starts with letter, ends alnum
  const community =
    await api.functional.communityPlatform.communityMember.communities.create(
      ownerConn,
      {
        body: {
          name: communityName as string,
          community_platform_category_id: typia.random<
            string & tags.Format<"uuid">
          >(),
          description: RandomGenerator.paragraph({ sentences: 6 }),
        } satisfies ICommunityPlatformCommunity.ICreate,
      },
    );
  typia.assert(community);

  // 2) Member1 account (join/authenticate)
  const member1Auth = await api.functional.auth.communityMember.join(
    member1Conn,
    {
      body: {
        username: `m1_${RandomGenerator.alphaNumeric(8)}`,
        email: typia.random<string & tags.Format<"email">>(),
        password: RandomGenerator.alphaNumeric(12),
      } satisfies ICommunityPlatformCommunityMember.ICreate,
    },
  );
  typia.assert(member1Auth);

  // 2-1) Member1 joins the owner's community
  const membership1 =
    await api.functional.communityPlatform.communityMember.communities.memberships.create(
      member1Conn,
      {
        communityId: community.id,
        body: {} satisfies ICommunityPlatformCommunityMembership.ICreate,
      },
    );
  typia.assert(membership1);

  // 2-2) Member2 account (join/authenticate)
  const member2Auth = await api.functional.auth.communityMember.join(
    member2Conn,
    {
      body: {
        username: `m2_${RandomGenerator.alphaNumeric(8)}`,
        email: typia.random<string & tags.Format<"email">>(),
        password: RandomGenerator.alphaNumeric(12),
      } satisfies ICommunityPlatformCommunityMember.ICreate,
    },
  );
  typia.assert(member2Auth);

  // 2-3) Member2 joins the owner's community
  const membership2 =
    await api.functional.communityPlatform.communityMember.communities.memberships.create(
      member2Conn,
      {
        communityId: community.id,
        body: {} satisfies ICommunityPlatformCommunityMembership.ICreate,
      },
    );
  typia.assert(membership2);

  // 3) Owner lists roster (default: exclude ended), sorted by created_at asc
  const pageReqAsc = {
    page: 1 satisfies number as number,
    limit: 10 satisfies number as number,
    sort_by: "created_at" as const,
    sort_dir: "asc" as const,
    // include_ended intentionally omitted to verify default exclusion
  } satisfies ICommunityPlatformCommunityMembership.IRequest;

  const firstPageBefore =
    await api.functional.communityPlatform.communityMember.communities.memberships.index(
      ownerConn,
      {
        communityId: community.id,
        body: pageReqAsc,
      },
    );
  typia.assert(firstPageBefore);

  // Verify both fresh memberships are present and active (deleted_at null)
  const idsBefore = firstPageBefore.data.map((d) => d.id);
  const m1InBefore = firstPageBefore.data.find((d) => d.id === membership1.id);
  const m2InBefore = firstPageBefore.data.find((d) => d.id === membership2.id);

  TestValidator.predicate(
    "member1 should be listed before ending",
    m1InBefore !== undefined,
  );
  TestValidator.predicate(
    "member2 should be listed before ending",
    m2InBefore !== undefined,
  );
  if (m1InBefore)
    TestValidator.equals(
      "member1 active (deleted_at null)",
      m1InBefore.deleted_at ?? null,
      null,
    );
  if (m2InBefore)
    TestValidator.equals(
      "member2 active (deleted_at null)",
      m2InBefore.deleted_at ?? null,
      null,
    );

  // Determine earliest membership via created_at asc
  const oneItemAscReq = {
    page: 1 satisfies number as number,
    limit: 1 satisfies number as number,
    sort_by: "created_at" as const,
    sort_dir: "asc" as const,
  } satisfies ICommunityPlatformCommunityMembership.IRequest;
  const topBefore =
    await api.functional.communityPlatform.communityMember.communities.memberships.index(
      ownerConn,
      { communityId: community.id, body: oneItemAscReq },
    );
  typia.assert(topBefore);
  const firstIdBefore = topBefore.data.length > 0 ? topBefore.data[0].id : null;
  TestValidator.predicate(
    "topBefore must have at least one membership",
    firstIdBefore !== null,
  );

  // Validate created_at ordering between our two memberships (ISO 8601 lex order is chronological)
  const created1 = membership1.created_at;
  const created2 = membership2.created_at;
  TestValidator.predicate(
    "created_at ordering: membership1 <= membership2",
    created1 <= created2,
  );

  // 4) Owner ends Member2's membership
  await api.functional.communityPlatform.communityMember.communities.memberships.erase(
    ownerConn,
    {
      communityId: community.id,
      membershipId: membership2.id,
    },
  );

  // 5) Owner lists again without include_ended: membership2 should be excluded
  const firstPageAfter =
    await api.functional.communityPlatform.communityMember.communities.memberships.index(
      ownerConn,
      {
        communityId: community.id,
        body: pageReqAsc,
      },
    );
  typia.assert(firstPageAfter);

  const m2InAfter = firstPageAfter.data.find((d) => d.id === membership2.id);
  TestValidator.equals(
    "membership2 excluded by default after end",
    m2InAfter ?? null,
    null,
  );

  // Include ended memberships: membership2 should appear with deleted_at set
  const pageReqIncludeEnded = {
    page: 1 satisfies number as number,
    limit: 10 satisfies number as number,
    sort_by: "created_at" as const,
    sort_dir: "asc" as const,
    include_ended: true,
  } satisfies ICommunityPlatformCommunityMembership.IRequest;

  const pageWithEnded =
    await api.functional.communityPlatform.communityMember.communities.memberships.index(
      ownerConn,
      { communityId: community.id, body: pageReqIncludeEnded },
    );
  typia.assert(pageWithEnded);

  const endedRow = pageWithEnded.data.find((d) => d.id === membership2.id);
  TestValidator.predicate(
    "membership2 appears when include_ended=true",
    endedRow !== undefined,
  );
  if (endedRow) {
    TestValidator.predicate(
      "membership2 has non-null deleted_at",
      endedRow.deleted_at !== null && endedRow.deleted_at !== undefined,
    );
  }

  // Deterministic pagination: the first item of page 1, limit 1 (created_at asc)
  // should remain the same before vs after ending membership2
  const topAfter =
    await api.functional.communityPlatform.communityMember.communities.memberships.index(
      ownerConn,
      { communityId: community.id, body: oneItemAscReq },
    );
  typia.assert(topAfter);
  const firstIdAfter = topAfter.data.length > 0 ? topAfter.data[0].id : null;

  TestValidator.equals(
    "first page top remains stable (deterministic)",
    firstIdAfter,
    firstIdBefore,
  );
}
