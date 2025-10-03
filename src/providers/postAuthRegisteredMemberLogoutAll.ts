import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ICommunityPlatformRegisteredMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRegisteredMember";
import { RegisteredmemberPayload } from "../decorators/payload/RegisteredmemberPayload";

export async function postAuthRegisteredMemberLogoutAll(props: {
  registeredMember: RegisteredmemberPayload;
}): Promise<ICommunityPlatformRegisteredMember.ILogoutAllResult> {
  /**
   * Revoke all active sessions for the authenticated registered member.
   *
   * Updates Sessions.community_platform_sessions by setting revoked_at for all
   * non-deleted sessions belonging to the caller's community_platform_user_id.
   * Operation is idempotent; already-revoked sessions are ignored.
   *
   * @param props - Request properties
   * @param props.registeredMember - The authenticated Registered Member payload
   * @returns Bulk logout summary with the number of sessions newly revoked
   * @throws {HttpException} 401 when authentication is missing or invalid
   */
  const { registeredMember } = props;
  if (!registeredMember || registeredMember.type !== "registeredmember") {
    throw new HttpException("Unauthorized: Please sign in to continue.", 401);
  }

  const now: string & tags.Format<"date-time"> = toISOStringSafe(new Date());

  const updated = await MyGlobal.prisma.community_platform_sessions.updateMany({
    where: {
      community_platform_user_id: registeredMember.id,
      revoked_at: null,
      deleted_at: null,
    },
    data: {
      revoked_at: now,
      updated_at: now,
    },
  });

  const message: string | undefined =
    updated.count === 0
      ? "No active sessions were found to revoke."
      : undefined;

  return {
    revoked_count: Number(updated.count) as number &
      tags.Type<"int32"> &
      tags.Minimum<0>,
    message,
  };
}
