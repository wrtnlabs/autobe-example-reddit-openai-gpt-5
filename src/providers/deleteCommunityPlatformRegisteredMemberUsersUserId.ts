import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { RegisteredmemberPayload } from "../decorators/payload/RegisteredmemberPayload";

export async function deleteCommunityPlatformRegisteredMemberUsersUserId(props: {
  registeredMember: RegisteredmemberPayload;
  userId: string & tags.Format<"uuid">;
}): Promise<void> {
  /**
   * Deactivate a user (soft-delete) by setting deleted_at on
   * community_platform_users.
   *
   * - Only self-deactivation is allowed for registered members (payload.id must
   *   equal path userId).
   * - Marks the user row deleted_at with current timestamp and updates
   *   updated_at.
   * - Revokes all active sessions for the user (sets revoked_at, updated_at).
   * - Soft-deletes the registered member role record to prevent further access.
   * - Idempotent: repeated calls keep deleted state.
   *
   * @param props - Request properties
   * @param props.registeredMember - Authenticated registered member payload
   *   (must match userId)
   * @param props.userId - Target user's UUID
   * @returns Void (204 No Content)
   * @throws {HttpException} 403 When attempting to deactivate another user's
   *   account
   * @throws {HttpException} 404 When the target user does not exist
   */
  const { registeredMember, userId } = props;

  // Authorization: registered members can only deactivate themselves
  if (!registeredMember || registeredMember.id !== userId) {
    throw new HttpException(
      "Forbidden: You can only deactivate your own account",
      403,
    );
  }

  // Ensure target user exists (even if already deactivated)
  const existing = await MyGlobal.prisma.community_platform_users.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (existing === null) {
    throw new HttpException("Not Found: User does not exist", 404);
  }

  // Current timestamp for soft delete and audit updates
  const now = toISOStringSafe(new Date());

  // Perform soft delete and revoke sessions within a single transaction
  await MyGlobal.prisma.$transaction([
    // Soft delete user (idempotent)
    MyGlobal.prisma.community_platform_users.update({
      where: { id: userId },
      data: {
        deleted_at: now,
        updated_at: now,
      },
    }),
    // Revoke all active sessions for this user
    MyGlobal.prisma.community_platform_sessions.updateMany({
      where: {
        community_platform_user_id: userId,
        revoked_at: null,
      },
      data: {
        revoked_at: now,
        updated_at: now,
      },
    }),
    // Soft-delete registered member role to block further member access
    MyGlobal.prisma.community_platform_registeredmembers.updateMany({
      where: {
        community_platform_user_id: userId,
        deleted_at: null,
      },
      data: {
        deleted_at: now,
        updated_at: now,
      },
    }),
  ]);

  return;
}
