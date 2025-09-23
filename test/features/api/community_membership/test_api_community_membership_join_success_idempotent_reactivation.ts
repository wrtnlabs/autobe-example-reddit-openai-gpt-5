import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformCommunityMembership } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMembership";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

/**
 * Verify community membership join lifecycle: success, idempotent retry, and
 * reactivation after leave.
 *
 * Business flow
 *
 * 1. Register and authenticate a community member (token auto-applied by SDK)
 * 2. Create a community as the authenticated member (owner inferred by server)
 * 3. Join the community (membership create)
 * 4. Attempt to join again (idempotent behavior: either returns same active
 *    membership or errors by policy)
 * 5. End the membership (soft-delete)
 * 6. Re-join the community (reactivation should return the original membership id)
 *
 * Notes
 *
 * - Category id is treated as a fixture; test uses a random UUID to satisfy type.
 * - Do not test HTTP status codes; accept either success or error in second join.
 * - SDK manages headers; test must not touch connection.headers.
 */
export async function test_api_community_membership_join_success_idempotent_reactivation(
  connection: api.IConnection,
) {
  // 1) Register and authenticate a community member
  const joinBody = {
    username: RandomGenerator.name(1),
    email: typia.random<string & tags.Format<"email">>(),
    password: "P@ssw0rd123", // satisfies MinLength<8>
  } satisfies ICommunityPlatformCommunityMember.ICreate;
  const authorized = await api.functional.auth.communityMember.join(
    connection,
    {
      body: joinBody,
    },
  );
  typia.assert<ICommunityPlatformCommunityMember.IAuthorized>(authorized);

  // 2) Create a community
  const categoryId: string & tags.Format<"uuid"> = typia.random<
    string & tags.Format<"uuid">
  >();
  const communityName = `c${RandomGenerator.alphabets(8)}`; // 9 letters, starts with alpha
  const createCommunityBody = {
    name: communityName,
    community_platform_category_id: categoryId,
    description: RandomGenerator.paragraph({ sentences: 6 }),
  } satisfies ICommunityPlatformCommunity.ICreate;
  const community =
    await api.functional.communityPlatform.communityMember.communities.create(
      connection,
      { body: createCommunityBody },
    );
  typia.assert<ICommunityPlatformCommunity>(community);

  // Validate ownership linkage (owner is the authenticated user)
  TestValidator.equals(
    "community owner equals authenticated user id",
    community.community_platform_user_id,
    authorized.id,
  );

  // 3) First join: create membership
  const createMembershipBody =
    {} satisfies ICommunityPlatformCommunityMembership.ICreate;
  const membership1 =
    await api.functional.communityPlatform.communityMember.communities.memberships.create(
      connection,
      { communityId: community.id, body: createMembershipBody },
    );
  typia.assert<ICommunityPlatformCommunityMembership>(membership1);

  // Validate linkage and active state
  TestValidator.equals(
    "membership community id matches community.id",
    membership1.community_platform_community_id,
    community.id,
  );
  TestValidator.equals(
    "membership user id matches authorized.id",
    membership1.community_platform_user_id,
    authorized.id,
  );
  TestValidator.predicate(
    "first join should be active (deleted_at is nullish)",
    membership1.deleted_at === null || membership1.deleted_at === undefined,
  );

  // 4) Second join: idempotent behavior (accept success with same id or an error)
  let secondJoinErrored = false;
  let membership2: ICommunityPlatformCommunityMembership | null = null;
  try {
    const out =
      await api.functional.communityPlatform.communityMember.communities.memberships.create(
        connection,
        { communityId: community.id, body: createMembershipBody },
      );
    typia.assert<ICommunityPlatformCommunityMembership>(out);
    membership2 = out;
  } catch (exp) {
    if (exp instanceof api.HttpError) secondJoinErrored = true;
    else throw exp;
  }
  if (membership2 !== null) {
    TestValidator.equals(
      "idempotent second join returns the same membership id",
      membership2.id,
      membership1.id,
    );
    TestValidator.predicate(
      "second join result remains active (deleted_at is nullish)",
      membership2.deleted_at === null || membership2.deleted_at === undefined,
    );
  }
  TestValidator.predicate(
    "second join either returned same membership or failed by policy",
    secondJoinErrored ||
      (membership2 !== null && membership2.id === membership1.id),
  );

  // 5) End the membership (soft-delete)
  await api.functional.communityPlatform.communityMember.communities.memberships.erase(
    connection,
    { communityId: community.id, membershipId: membership1.id },
  );

  // 6) Re-join should reactivate the same membership id
  const membershipReactivated =
    await api.functional.communityPlatform.communityMember.communities.memberships.create(
      connection,
      { communityId: community.id, body: createMembershipBody },
    );
  typia.assert<ICommunityPlatformCommunityMembership>(membershipReactivated);
  TestValidator.equals(
    "reactivated membership id equals original membership id",
    membershipReactivated.id,
    membership1.id,
  );
  TestValidator.predicate(
    "reactivated membership is active (deleted_at is nullish)",
    membershipReactivated.deleted_at === null ||
      membershipReactivated.deleted_at === undefined,
  );
}
