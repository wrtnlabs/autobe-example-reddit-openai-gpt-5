import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { IClientContext } from "@ORGANIZATION/PROJECT-api/lib/structures/IClientContext";
import type { ICommunityPlatformRegisteredMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRegisteredMember";
import type { ICommunityPlatformSession } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSession";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";
import type { IECommunityPlatformSessionSort } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformSessionSort";
import type { IECommunityPlatformSessionStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformSessionStatus";
import type { IEOrderDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IEOrderDirection";
import type { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import type { IPageICommunityPlatformSession } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformSession";

export async function test_api_member_sessions_listing_after_join_and_refresh(
  connection: api.IConnection,
) {
  /**
   * Validate that a newly joined registered member can list their own
   * authentication sessions and that refreshing the session preserves access
   * and consistent ordering.
   *
   * Steps
   *
   * 1. Join as a registered member and capture the authorized entity.
   * 2. List sessions with sort_by = last_seen_at, order = desc.
   *
   *    - Assert type, ownership, ordering, and pagination sanity.
   * 3. Refresh the session to update lastSeenAt.
   * 4. List sessions again and verify ordering is preserved and the top sort key
   *    did not decrease (if comparable).
   */
  // 1) Join as a registered member
  const email: string & tags.Format<"email"> = typia.random<
    string & tags.Format<"email">
  >();
  const username: string = `member_${RandomGenerator.alphaNumeric(12)}`;
  const password: string = `Pw_${RandomGenerator.alphaNumeric(16)}`;

  const clientContext = {
    userAgent: `e2e/${RandomGenerator.paragraph({ sentences: 2 })}`,
    ip: "127.0.0.1",
    clientPlatform: "e2e-test",
    clientDevice: "node",
    sessionType: "standard",
  } satisfies IClientContext;

  const authorized: ICommunityPlatformRegisteredMember.IAuthorized =
    await api.functional.auth.registeredMember.join(connection, {
      body: {
        email,
        username,
        password,
        displayName: RandomGenerator.name(),
        client: clientContext,
      } satisfies ICommunityPlatformRegisteredMember.IJoin,
    });
  typia.assert(authorized);

  // Helper to compute primary sort key (ms epoch) per provider guidance
  const toEpoch = (iso: string): number => new Date(iso).getTime();
  const primaryKey = (s: ICommunityPlatformSession.ISummary): number =>
    s.lastSeenAt !== null && s.lastSeenAt !== undefined
      ? toEpoch(s.lastSeenAt)
      : toEpoch(s.createdAt);

  // 2) First listing
  const request1 = {
    sort_by: "last_seen_at",
    order: "desc",
    limit: 20 as number,
  } satisfies ICommunityPlatformSession.IRequest;

  const page1: IPageICommunityPlatformSession.ISummary =
    await api.functional.communityPlatform.registeredMember.sessions.index(
      connection,
      { body: request1 },
    );
  typia.assert(page1);

  // Ownership: sessions belong to the authorized user
  for (let i = 0; i < page1.data.length; i++) {
    const s = page1.data[i];
    TestValidator.equals(
      `ownership: session[${i}].userId equals authorized.id`,
      s.userId,
      authorized.id,
    );
  }

  // Pagination sanity checks
  TestValidator.predicate(
    "pagination.current is non-negative",
    page1.pagination.current >= 0,
  );
  TestValidator.predicate(
    "pagination.limit is positive",
    page1.pagination.limit >= 1,
  );
  TestValidator.predicate(
    "pagination.records is non-negative",
    page1.pagination.records >= 0,
  );
  TestValidator.predicate(
    "pagination.pages is non-negative",
    page1.pagination.pages >= 0,
  );
  TestValidator.predicate(
    "data length does not exceed pagination.limit",
    page1.data.length <= page1.pagination.limit,
  );

  // Ordering: non-increasing by primary sort key (desc)
  const keys1: number[] = page1.data.map(primaryKey);
  for (let i = 1; i < keys1.length; i++) {
    TestValidator.predicate(
      `ordering: keys1[${i - 1}] >= keys1[${i}]`,
      keys1[i - 1] >= keys1[i],
    );
  }
  const topKeyBefore: number | null = keys1.length > 0 ? keys1[0] : null;

  // 3) Refresh the session (rotate/extend and update lastSeenAt)
  const refreshed: ICommunityPlatformRegisteredMember.IAuthorized =
    await api.functional.auth.registeredMember.refresh(connection, {
      body: {} satisfies ICommunityPlatformRegisteredMember.IRefresh,
    });
  typia.assert(refreshed);
  // Sanity: same principal id should remain
  TestValidator.equals(
    "principal id remains after refresh",
    refreshed.id,
    authorized.id,
  );

  // 4) Second listing
  const request2 = {
    sort_by: "last_seen_at",
    order: "desc",
    limit: 20 as number,
  } satisfies ICommunityPlatformSession.IRequest;

  const page2: IPageICommunityPlatformSession.ISummary =
    await api.functional.communityPlatform.registeredMember.sessions.index(
      connection,
      { body: request2 },
    );
  typia.assert(page2);

  // Ownership again
  for (let i = 0; i < page2.data.length; i++) {
    const s = page2.data[i];
    TestValidator.equals(
      `ownership (after refresh): session[${i}].userId equals authorized.id`,
      s.userId,
      authorized.id,
    );
  }

  // Pagination sanity again
  TestValidator.predicate(
    "data length (after refresh) does not exceed pagination.limit",
    page2.data.length <= page2.pagination.limit,
  );

  // Ordering again
  const keys2: number[] = page2.data.map(primaryKey);
  for (let i = 1; i < keys2.length; i++) {
    TestValidator.predicate(
      `ordering after refresh: keys2[${i - 1}] >= keys2[${i}]`,
      keys2[i - 1] >= keys2[i],
    );
  }

  // Ensure top sort key did not decrease after refresh if comparable
  if (topKeyBefore !== null && keys2.length > 0) {
    TestValidator.predicate(
      "top sort key is not earlier after refresh",
      keys2[0] >= topKeyBefore,
    );
  }
}
