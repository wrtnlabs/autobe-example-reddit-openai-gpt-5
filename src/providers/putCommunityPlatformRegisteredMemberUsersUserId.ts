import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";
import { RegisteredmemberPayload } from "../decorators/payload/RegisteredmemberPayload";

export async function putCommunityPlatformRegisteredMemberUsersUserId(props: {
  registeredMember: RegisteredmemberPayload;
  userId: string & tags.Format<"uuid">;
  body: ICommunityPlatformUser.IUpdate;
}): Promise<ICommunityPlatformUser> {
  const { registeredMember, userId, body } = props;

  // Authorization: only the owner can update their own profile in this endpoint
  if (!registeredMember || registeredMember.id !== userId) {
    throw new HttpException(
      "Forbidden: You can only update your own profile",
      403,
    );
  }

  // Ensure target user exists and is not soft-deleted
  const existing = await MyGlobal.prisma.community_platform_users.findFirst({
    where: {
      id: userId,
      deleted_at: null,
    },
    select: {
      id: true,
      email: true,
      username: true,
      display_name: true,
      last_login_at: true,
      created_at: true,
      updated_at: true,
    },
  });
  if (!existing) {
    throw new HttpException(
      "Not Found: User does not exist or is deactivated",
      404,
    );
  }

  // Pre-compute normalization and uniqueness checks
  const updatingEmail = body.email !== undefined;
  const updatingUsername = body.username !== undefined;

  const normalizedEmail = updatingEmail
    ? String(body.email).trim().toLowerCase()
    : undefined;
  const normalizedUsername = updatingUsername
    ? String(body.username).trim().toLowerCase()
    : undefined;

  if (updatingEmail && normalizedEmail) {
    const emailConflict =
      await MyGlobal.prisma.community_platform_users.findFirst({
        where: {
          email_normalized: normalizedEmail,
          NOT: { id: userId },
        },
        select: { id: true },
      });
    if (emailConflict) {
      throw new HttpException("Conflict: Email already in use", 409);
    }
  }

  if (updatingUsername && normalizedUsername) {
    const usernameConflict =
      await MyGlobal.prisma.community_platform_users.findFirst({
        where: {
          username_normalized: normalizedUsername,
          NOT: { id: userId },
        },
        select: { id: true },
      });
    if (usernameConflict) {
      throw new HttpException("Conflict: Username already in use", 409);
    }
  }

  // Update record
  const now = toISOStringSafe(new Date());
  const updated = await MyGlobal.prisma.community_platform_users.update({
    where: { id: userId },
    data: {
      email: body.email ?? undefined,
      username: body.username ?? undefined,
      display_name:
        body.displayName === null ? null : (body.displayName ?? undefined),
      // maintain normalized columns when their sources are updated
      email_normalized: normalizedEmail ?? undefined,
      username_normalized: normalizedUsername ?? undefined,
      updated_at: now,
    },
    select: {
      id: true,
      email: true,
      username: true,
      display_name: true,
      last_login_at: true,
      created_at: true,
      updated_at: true,
    },
  });

  // Build response DTO
  const result: ICommunityPlatformUser = {
    /** Primary key (UUID) */
    id: userId,
    /** Email (public) */
    email: updated.email as string & tags.Format<"email">,
    /** Username (public) */
    username: updated.username,
    /** Optional display name */
    displayName: updated.display_name ?? null,
    /** Created timestamp */
    createdAt: toISOStringSafe(updated.created_at),
    /** Updated timestamp */
    updatedAt: toISOStringSafe(updated.updated_at),
    /** Optional last login timestamp */
    lastLoginAt: updated.last_login_at
      ? toISOStringSafe(updated.last_login_at)
      : undefined,
  };

  return result;
}
