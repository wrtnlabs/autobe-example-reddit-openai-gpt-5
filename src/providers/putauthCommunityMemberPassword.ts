import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import { CommunitymemberPayload } from "../decorators/payload/CommunitymemberPayload";

/**
 * Change password for communityMember by updating password_hash and
 * password_updated_at.
 *
 * Verifies the caller's current password against the stored hash in
 * community_platform_user_credentials, then rotates to the new password by
 * updating password_hash and setting password_updated_at. Timestamps are
 * persisted using ISO strings. Provider intentionally preserves the current
 * session continuity (no mass revocation here).
 *
 * @param props - Request properties
 * @param props.communityMember - Authenticated community member payload (user
 *   id holder)
 * @param props.body - Payload containing current_password and new_password
 * @returns Void on success (no response body)
 * @throws {HttpException} 404 when credentials are not found for the user
 * @throws {HttpException} 401 when current password verification fails
 */
export async function putauthCommunityMemberPassword(props: {
  communityMember: CommunitymemberPayload;
  body: ICommunityPlatformCommunityMember.IUpdate;
}): Promise<void> {
  const { communityMember, body } = props;

  // 1) Load active credential record for this user (must be non-deleted)
  const credentials =
    await MyGlobal.prisma.community_platform_user_credentials.findFirst({
      where: {
        community_platform_user_id: communityMember.id,
        deleted_at: null,
      },
      select: {
        id: true,
        password_hash: true,
      },
    });
  if (!credentials) {
    throw new HttpException("Not Found: Credentials not found", 404);
  }

  // 2) Verify current password
  const matches = await MyGlobal.password.verify(
    body.current_password,
    credentials.password_hash,
  );
  if (!matches) {
    throw new HttpException("Unauthorized: Current password is incorrect", 401);
  }

  // 3) Rotate to the new password
  const now: string & tags.Format<"date-time"> = toISOStringSafe(new Date());
  const newHash: string = await MyGlobal.password.hash(body.new_password);

  await MyGlobal.prisma.community_platform_user_credentials.update({
    where: { id: credentials.id },
    data: {
      password_hash: newHash,
      password_updated_at: now,
      updated_at: now,
    },
  });

  // 4) Optional policy: revoke other sessions (SKIPPED for continuity)
  // Implementers may choose to revoke sessions where revoked_at is null and
  // community_platform_user_id equals the actor, excluding the current one if tracked.
  return;
}
