import { ArrayUtil, RandomGenerator, TestValidator } from "@nestia/e2e";
import { IConnection } from "@nestia/fetcher";
import typia, { tags } from "typia";

import api from "@ORGANIZATION/PROJECT-api";
import type { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import type { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import type { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

export async function test_api_community_member_refresh_with_invalid_refresh_token(
  connection: api.IConnection,
) {
  /**
   * Verify that invalid refresh tokens are rejected by the community member
   * refresh endpoint.
   *
   * Flow:
   *
   * - Construct two token variants:
   *
   *   1. Malformed token (non‑JWT random string)
   *   2. Well‑formed‑looking but forged token (three dot‑separated pseudo‑base64
   *        segments)
   * - If running in simulation mode, a well‑typed input always succeeds; perform
   *   a smoke success call and assert.
   * - Otherwise, for each invalid token, expect the API to throw an error
   *   (without asserting specific status codes).
   */

  // Variant 1: Malformed, non‑JWT token string
  const malformedToken: string = `bad_${RandomGenerator.alphaNumeric(24)}`;

  // Variant 2: Well‑formed‑looking but forged (header.payload.signature with random segments)
  const forgedToken: string = [
    RandomGenerator.alphaNumeric(16),
    RandomGenerator.alphaNumeric(24),
    RandomGenerator.alphaNumeric(32),
  ].join(".");

  // In simulate mode, backend returns random success for any well‑typed body.
  // Run a smoke test to assert response type and skip negative expectations.
  if (connection.simulate === true) {
    const bodySimulate = {
      refresh_token: RandomGenerator.alphaNumeric(64),
    } satisfies ICommunityPlatformCommunityMember.IRefresh;

    const authorized = await api.functional.auth.communityMember.refresh(
      connection,
      { body: bodySimulate },
    );
    typia.assert(authorized);
    return;
  }

  // Non‑simulate mode: invalid tokens must be rejected.
  await TestValidator.error("rejects malformed refresh token", async () => {
    await api.functional.auth.communityMember.refresh(connection, {
      body: {
        refresh_token: malformedToken,
      } satisfies ICommunityPlatformCommunityMember.IRefresh,
    });
  });

  await TestValidator.error(
    "rejects forged but well‑formed refresh token",
    async () => {
      await api.functional.auth.communityMember.refresh(connection, {
        body: {
          refresh_token: forgedToken,
        } satisfies ICommunityPlatformCommunityMember.IRefresh,
      });
    },
  );
}
