import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { CommunitymemberPayload } from "../decorators/payload/CommunitymemberPayload";

/**
 * Revoke all communityMember sessions by setting revoked_at on all session
 * rows.
 *
 * This endpoint signs the authenticated community member out from all devices
 * by updating every session (community_platform_sessions) owned by the user so
 * that revoked_at is set. After this operation, no previous refresh tokens can
 * be used to renew access.
 *
 * Authorization: Requires an authenticated Community Member. Additionally
 * verifies the user exists, is active, and not soft-deleted before proceeding.
 *
 * @param props - Request properties
 * @param props.communityMember - Authenticated Community Member payload
 *   containing the user id
 * @returns Void
 * @throws {HttpException} 403 when user is inactive, deleted, or not found
 */
export async function postauthCommunityMemberLogoutAll(props: {
  communityMember: CommunitymemberPayload;
}): Promise<void> {
  const { communityMember } = props;

  // Ensure the authenticated user exists and is active
  const user = await MyGlobal.prisma.community_platform_users.findUnique({
    where: { id: communityMember.id },
    select: { id: true, status: true, deleted_at: true },
  });
  if (!user) {
    throw new HttpException("Unauthorized: User not found", 403);
  }
  if (user.deleted_at !== null || user.status !== "active") {
    throw new HttpException("Unauthorized: Inactive or deleted user", 403);
  }

  // Revoke all sessions for this user
  const now = toISOStringSafe(new Date());
  await MyGlobal.prisma.community_platform_sessions.updateMany({
    where: {
      community_platform_user_id: communityMember.id,
      deleted_at: null,
      revoked_at: null,
    },
    data: {
      revoked_at: now,
      updated_at: now,
    },
  });

  // No response body
  return;
}
