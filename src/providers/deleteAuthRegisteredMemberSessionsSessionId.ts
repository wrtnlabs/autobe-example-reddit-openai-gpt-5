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

/**
 * Revoke one session in community_platform_sessions by ID for the current
 * member.
 *
 * Targeted revocation of a specific session by its identifier. Verifies
 * ownership via community_platform_user_id. If owned and active, marks
 * revoked_at and updates updated_at. If already revoked or expired, behaves
 * idempotently and returns status "already_revoked". Does not alter user
 * credentials or membership roles.
 *
 * @param props - Request properties
 * @param props.registeredMember - Authenticated registered member payload
 * @param props.sessionId - Target session’s UUID to revoke
 * @returns Per-session revocation result including status and revoked_at when
 *   applicable
 * @throws {HttpException} 404 when session does not exist
 * @throws {HttpException} 403 when session does not belong to the caller
 */
export async function deleteAuthRegisteredMemberSessionsSessionId(props: {
  registeredMember: RegisteredmemberPayload;
  sessionId: string & tags.Format<"uuid">;
}): Promise<ICommunityPlatformRegisteredMember.ISessionRevocationResult> {
  const { registeredMember, sessionId } = props;

  // 1) Load target session
  const session = await MyGlobal.prisma.community_platform_sessions.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      community_platform_user_id: true,
      expires_at: true,
      revoked_at: true,
    },
  });

  if (!session) {
    throw new HttpException("Not Found: Session does not exist", 404);
  }

  // 2) Ownership enforcement
  if (session.community_platform_user_id !== registeredMember.id) {
    throw new HttpException(
      "Forbidden: You can only revoke your own sessions",
      403,
    );
  }

  // 3) Idempotency checks: already revoked or expired
  const now: string & tags.Format<"date-time"> = toISOStringSafe(new Date());
  const expiresAtIso: string & tags.Format<"date-time"> = toISOStringSafe(
    session.expires_at,
  );
  const isExpired = expiresAtIso <= now;
  const isAlreadyRevoked = session.revoked_at !== null;

  if (isAlreadyRevoked || isExpired) {
    return {
      session_id: sessionId,
      status: "already_revoked",
      revoked_at: isAlreadyRevoked
        ? toISOStringSafe(session.revoked_at!)
        : null,
      message: isExpired
        ? "The session was already inactive (expired or revoked)."
        : "The session had already been revoked.",
    };
  }

  // 4) Perform revocation update
  await MyGlobal.prisma.community_platform_sessions.update({
    where: { id: sessionId },
    data: {
      revoked_at: now,
      updated_at: now,
    },
  });

  return {
    session_id: sessionId,
    status: "revoked",
    revoked_at: now,
    message: "Session successfully revoked.",
  };
}
