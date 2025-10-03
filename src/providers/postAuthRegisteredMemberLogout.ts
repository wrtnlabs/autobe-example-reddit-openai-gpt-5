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

export async function postAuthRegisteredMemberLogout(props: {
  registeredMember: RegisteredmemberPayload;
  body: ICommunityPlatformRegisteredMember.ILogoutRequest;
}): Promise<ICommunityPlatformRegisteredMember.ILogoutResult> {
  const { registeredMember, body } = props;

  // Authorization guard: must have a valid registered member context
  if (!registeredMember || !registeredMember.id) {
    throw new HttpException("Please sign in to continue.", 401);
  }

  // Verify active registered-member role and non-deleted user
  const activeMember =
    await MyGlobal.prisma.community_platform_registeredmembers.findFirst({
      where: {
        community_platform_user_id: registeredMember.id,
        deleted_at: null,
        user: { deleted_at: null },
      },
      select: { id: true },
    });
  if (activeMember === null) {
    throw new HttpException("Forbidden: Not an active registered member.", 403);
  }

  // Find the "current" session: latest by created_at for this user (not soft-deleted)
  const session = await MyGlobal.prisma.community_platform_sessions.findFirst({
    where: {
      community_platform_user_id: registeredMember.id,
      deleted_at: null,
    },
    orderBy: { created_at: "desc" },
  });

  if (!session) {
    throw new HttpException("Active session not found.", 404);
  }

  // Prepare current timestamp in ISO format
  const now: string & tags.Format<"date-time"> = toISOStringSafe(new Date());

  // Determine idempotent behavior: already revoked or expired
  const revokedAlready = session.revoked_at !== null;
  const expiresAtISO: string & tags.Format<"date-time"> = toISOStringSafe(
    session.expires_at,
  );
  const isExpired = expiresAtISO <= now;

  if (!revokedAlready && !isExpired) {
    // Revoke the session now and update optional client hints
    await MyGlobal.prisma.community_platform_sessions.update({
      where: { id: session.id },
      data: {
        revoked_at: now,
        updated_at: now,
        last_seen_at: now,
        user_agent: body.userAgent ?? undefined,
        client_platform: body.clientPlatform ?? undefined,
        client_device: body.clientDevice ?? undefined,
      },
    });

    return {
      session_id: session.id as string & tags.Format<"uuid">,
      status: "revoked",
      revoked_at: now,
      message: "Session successfully revoked.",
    };
  }

  // Idempotent path: session already inactive (revoked or expired).
  // Optionally refresh metadata and timestamps without changing revoked_at
  await MyGlobal.prisma.community_platform_sessions.update({
    where: { id: session.id },
    data: {
      updated_at: now,
      last_seen_at: now,
      user_agent: body.userAgent ?? undefined,
      client_platform: body.clientPlatform ?? undefined,
      client_device: body.clientDevice ?? undefined,
    },
  });

  return {
    session_id: session.id as string & tags.Format<"uuid">,
    status: "already_revoked",
    revoked_at: null,
    message: isExpired
      ? "Session already expired; treated as revoked."
      : "Session was already revoked.",
  };
}
