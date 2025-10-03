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

export async function getCommunityPlatformRegisteredMemberMe(props: {
  registeredMember: RegisteredmemberPayload;
}): Promise<ICommunityPlatformUser> {
  /**
   * Get the authenticated user profile (community_platform_users).
   *
   * Retrieves the caller's profile using the authenticated Registered Member
   * context. Soft-deactivated accounts (deleted_at set) are treated as
   * unauthorized. Read-only: no data is modified.
   *
   * @param props - Request properties
   * @param props.registeredMember - Authenticated registered member payload
   *   (user id source)
   * @returns The authenticated user's public-safe profile
   * @throws {HttpException} 401 When unauthenticated or account is
   *   deactivated/not found
   */
  const payload = props?.registeredMember;
  if (!payload || !payload.id) {
    throw new HttpException("Please sign in to continue.", 401);
  }

  const user = await MyGlobal.prisma.community_platform_users.findFirst({
    where: { id: payload.id, deleted_at: null },
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

  if (!user) {
    throw new HttpException("Please sign in to continue.", 401);
  }

  return {
    id: user.id as string & tags.Format<"uuid">,
    email: user.email as string & tags.Format<"email">,
    username: user.username,
    displayName: user.display_name ?? null,
    createdAt: toISOStringSafe(user.created_at),
    updatedAt: toISOStringSafe(user.updated_at),
    lastLoginAt: user.last_login_at
      ? toISOStringSafe(user.last_login_at)
      : undefined,
  };
}
