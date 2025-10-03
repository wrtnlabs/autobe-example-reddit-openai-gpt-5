import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformSiteAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSiteAdmin";
import type { ICommunityPlatformSiteAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSiteAdminJoin";
import type { ICommunityPlatformSiteAdminRefresh } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSiteAdminRefresh";

/**
 * Validate Site Admin session renewal and continuity.
 *
 * Business goal: ensure that an authenticated Site Admin can refresh their
 * session using POST /auth/siteAdmin/refresh and immediately continue
 * privileged operations, without re-login. Since only join/refresh are
 * available in the scope, we verify continuity by performing a second refresh
 * after renewal.
 *
 * Steps:
 *
 * 1. Join as a new Site Admin: POST /auth/siteAdmin/join
 * 2. Refresh the session: POST /auth/siteAdmin/refresh
 * 3. Validate identity consistency and that token is rotated OR expiry extended
 * 4. Perform an additional refresh to prove privileged continuity
 */
export async function test_api_site_admin_session_refresh_resume_after_renewal(
  connection: api.IConnection,
) {
  // Helper: generate a username that matches ^[A-Za-z0-9](?:[A-Za-z0-9_-]{1,28}[A-Za-z0-9])?$ (length 2~30)
  const makeUsername = (len: number): string => {
    const alnum = [..."abcdefghijklmnopqrstuvwxyz", ..."0123456789"];
    const midset = [..."abcdefghijklmnopqrstuvwxyz", ..."0123456789", "_", "-"];
    const L = Math.min(30, Math.max(2, len));
    const first = RandomGenerator.pick(alnum);
    const last = RandomGenerator.pick(alnum);
    const middleLen = Math.max(0, L - 2);
    let mid = "";
    for (let i = 0; i < middleLen; ++i) mid += RandomGenerator.pick(midset);
    return `${first}${mid}${last}`;
  };

  // 1) Site Admin joins -> initial session issued
  const joinBody = {
    email: typia.random<string & tags.Format<"email">>(),
    username: makeUsername(12),
    password: RandomGenerator.alphaNumeric(12),
  } satisfies ICommunityPlatformSiteAdminJoin.ICreate;

  const joined = await api.functional.auth.siteAdmin.join(connection, {
    body: joinBody,
  });
  typia.assert(joined);

  // Capture initial authorization token
  const before = joined.token;
  const beforeAccess = before.access;
  const beforeExpiredAtMs = Date.parse(before.expired_at);
  const beforeRefreshableUntilMs = Date.parse(before.refreshable_until);

  // 2) Refresh the session with client context hints
  const refreshBody1 = {
    userAgent: `e2e/${RandomGenerator.alphaNumeric(6)}`,
    clientPlatform: "test-suite",
    clientDevice: RandomGenerator.name(1),
  } satisfies ICommunityPlatformSiteAdminRefresh.IRequest;

  const refreshed = await api.functional.auth.siteAdmin.refresh(connection, {
    body: refreshBody1,
  });
  typia.assert(refreshed);

  // 3) Validations after first refresh
  TestValidator.equals(
    "admin id should be stable across refresh",
    refreshed.id,
    joined.id,
  );
  TestValidator.equals(
    "admin userId should be stable across refresh",
    refreshed.userId,
    joined.userId,
  );

  const after1 = refreshed.token;
  const after1Access = after1.access;
  const after1ExpiredAtMs = Date.parse(after1.expired_at);
  const after1RefreshableUntilMs = Date.parse(after1.refreshable_until);

  TestValidator.predicate(
    "token rotated or expiry extended on first refresh",
    after1Access !== beforeAccess || after1ExpiredAtMs > beforeExpiredAtMs,
  );
  TestValidator.predicate(
    "refreshable_until should not be earlier after first refresh",
    after1RefreshableUntilMs >= beforeRefreshableUntilMs,
  );

  // 4) Privileged continuity: perform another refresh immediately
  const refreshBody2 = {
    clientDevice: `device-${RandomGenerator.alphaNumeric(5)}`,
  } satisfies ICommunityPlatformSiteAdminRefresh.IRequest;

  const refreshedAgain = await api.functional.auth.siteAdmin.refresh(
    connection,
    { body: refreshBody2 },
  );
  typia.assert(refreshedAgain);

  TestValidator.equals(
    "admin id should be stable across second refresh",
    refreshedAgain.id,
    joined.id,
  );
  TestValidator.equals(
    "admin userId should be stable across second refresh",
    refreshedAgain.userId,
    joined.userId,
  );

  const after2 = refreshedAgain.token;
  const after2ExpiredAtMs = Date.parse(after2.expired_at);
  TestValidator.predicate(
    "expiry should be non-decreasing through successive refreshes",
    after2ExpiredAtMs >= after1ExpiredAtMs,
  );
}
