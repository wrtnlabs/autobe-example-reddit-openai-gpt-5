import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ICommunityPlatformSession } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSession";
import { RegisteredmemberPayload } from "../decorators/payload/RegisteredmemberPayload";

export async function getCommunityPlatformRegisteredMemberSessionsSessionId(props: {
  registeredMember: RegisteredmemberPayload;
  sessionId: string & tags.Format<"uuid">;
}): Promise<ICommunityPlatformSession> {
  /**
   * Get a session by ID (community_platform_sessions)
   *
   * Retrieves a single authentication session by its UUID. Enforces ownership:
   * the session must belong to the authenticated registered member.
   * Soft-deleted sessions (deleted_at not null) are not returned. Revoked or
   * expired sessions may still be shown for history.
   *
   * @param props - Request properties
   * @param props.registeredMember - Authenticated registered member payload
   * @param props.sessionId - UUID of the session to retrieve
   * @returns Detailed session information suitable for session-management UIs
   * @throws {HttpException} 404 when session not found (or soft-deleted)
   * @throws {HttpException} 403 when session exists but does not belong to
   *   caller
   */
  const { registeredMember, sessionId } = props;

  const session = await MyGlobal.prisma.community_platform_sessions.findFirst({
    where: { id: sessionId, deleted_at: null },
    select: {
      id: true,
      community_platform_user_id: true,
      user_agent: true,
      ip: true,
      client_platform: true,
      client_device: true,
      session_type: true,
      created_at: true,
      updated_at: true,
      last_seen_at: true,
      expires_at: true,
      revoked_at: true,
      deleted_at: true,
    },
  });

  if (!session) {
    throw new HttpException("Not Found", 404);
  }

  if (session.community_platform_user_id !== registeredMember.id) {
    throw new HttpException(
      "Forbidden: You do not have access to this session",
      403,
    );
  }

  return {
    id: session.id as string & tags.Format<"uuid">,
    createdAt: toISOStringSafe(session.created_at),
    updatedAt: toISOStringSafe(session.updated_at),
    lastSeenAt: session.last_seen_at
      ? toISOStringSafe(session.last_seen_at)
      : undefined,
    expiresAt: toISOStringSafe(session.expires_at),
    revokedAt: session.revoked_at
      ? toISOStringSafe(session.revoked_at)
      : undefined,
    userAgent: session.user_agent ?? undefined,
    ip: session.ip ?? undefined,
    clientPlatform: session.client_platform ?? undefined,
    clientDevice: session.client_device ?? undefined,
    sessionType: session.session_type ?? undefined,
  };
}
