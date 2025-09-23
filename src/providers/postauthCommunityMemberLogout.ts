import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { CommunitymemberPayload } from "../decorators/payload/CommunitymemberPayload";

export async function postauthCommunityMemberLogout(props: {
  communityMember: CommunitymemberPayload;
}): Promise<void> {
  const { communityMember } = props;

  // Authorization: ensure correct role
  if (!communityMember || communityMember.type !== "communityMember") {
    throw new HttpException("Forbidden: Invalid role for logout", 403);
  }

  // Verify active community membership and active user
  const membership =
    await MyGlobal.prisma.community_platform_communitymembers.findFirst({
      where: {
        community_platform_user_id: communityMember.id,
        status: "active",
        deleted_at: null,
        user: {
          is: {
            status: "active",
            deleted_at: null,
          },
        },
      },
      select: { id: true },
    });

  if (membership === null) {
    throw new HttpException("Forbidden: Not an active community member", 403);
  }

  // Locate the current active session for this user (latest by issued_at)
  const session = await MyGlobal.prisma.community_platform_sessions.findFirst({
    where: {
      community_platform_user_id: communityMember.id,
      revoked_at: null,
      deleted_at: null,
    },
    orderBy: { issued_at: "desc" },
  });

  if (session === null) {
    throw new HttpException("Not Found: No active session to revoke", 404);
  }

  // Revoke the session
  const now = toISOStringSafe(new Date());
  await MyGlobal.prisma.community_platform_sessions.update({
    where: { id: session.id },
    data: {
      revoked_at: now,
      updated_at: now,
    },
  });

  return;
}
