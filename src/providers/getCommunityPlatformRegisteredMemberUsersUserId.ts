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

export async function getCommunityPlatformRegisteredMemberUsersUserId(props: {
  registeredMember: RegisteredmemberPayload;
  userId: string & tags.Format<"uuid">;
}): Promise<ICommunityPlatformUser> {
  const { registeredMember, userId } = props;

  // Authorization: allow self; otherwise require active site admin privileges
  if (registeredMember.id !== userId) {
    const activeAdmin =
      await MyGlobal.prisma.community_platform_siteadmins.findFirst({
        where: {
          community_platform_user_id: registeredMember.id,
          revoked_at: null,
          deleted_at: null,
        },
        select: { id: true },
      });
    if (!activeAdmin) {
      throw new HttpException(
        "Forbidden: You can only access your own profile",
        403,
      );
    }
  }

  // Fetch the user record (exclude soft-deleted)
  const row = await MyGlobal.prisma.community_platform_users.findFirst({
    where: {
      id: userId,
      deleted_at: null,
    },
    select: {
      id: true,
      email: true,
      username: true,
      display_name: true,
      created_at: true,
      updated_at: true,
      last_login_at: true,
    },
  });

  if (!row) {
    throw new HttpException(
      "Not Found: User does not exist or is unavailable",
      404,
    );
  }

  // Map to DTO ensuring proper date conversions and null-safe optionals
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    displayName: row.display_name ?? null,
    createdAt: toISOStringSafe(row.created_at),
    updatedAt: toISOStringSafe(row.updated_at),
    lastLoginAt: row.last_login_at ? toISOStringSafe(row.last_login_at) : null,
  };
}
