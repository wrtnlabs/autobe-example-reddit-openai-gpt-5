import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ICommunityPlatformSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSystemAdmin";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

/**
 * Revoke the current admin session by setting revoked_at in
 * community_platform_sessions.
 *
 * This operation authenticates the provided System Admin payload, verifies the
 * admin role is currently active, finds the caller's latest active session, and
 * revokes it by setting revoked_at (and updated_at). The change ensures
 * subsequent refresh attempts for this session fail. No other user or
 * credential data is modified.
 *
 * Additionally, an audit record with event_type "logout" is appended to
 * community_platform_audit_logs.
 *
 * @param props - Request properties
 * @param props.systemAdmin - The authenticated System Admin performing the
 *   logout
 * @returns Confirmation DTO containing the revocation timestamp and optional
 *   message
 * @throws {HttpException} 401 when authentication context is missing
 * @throws {HttpException} 403 when the user is not an active system
 *   administrator
 */
export async function postauthSystemAdminLogout(props: {
  systemAdmin: SystemadminPayload;
}): Promise<ICommunityPlatformSystemAdmin.ISignOut> {
  // Authentication presence check
  if (!props || !props.systemAdmin) {
    throw new HttpException("Unauthorized", 401);
  }
  const { systemAdmin } = props;
  if (systemAdmin.type !== "systemadmin") {
    throw new HttpException("Forbidden", 403);
  }

  // Authorization: ensure the user holds an active system admin role and user is active
  const admin = await MyGlobal.prisma.community_platform_systemadmins.findFirst(
    {
      where: {
        community_platform_user_id: systemAdmin.id,
        revoked_at: null,
        deleted_at: null,
        user: {
          is: {
            deleted_at: null,
            status: "active",
          },
        },
      },
    },
  );
  if (admin === null) {
    throw new HttpException("Forbidden", 403);
  }

  // Determine the caller's current (latest) active session
  const activeSession =
    await MyGlobal.prisma.community_platform_sessions.findFirst({
      where: {
        community_platform_user_id: systemAdmin.id,
        revoked_at: null,
        deleted_at: null,
      },
      orderBy: { created_at: "desc" },
    });

  const now: string & tags.Format<"date-time"> = toISOStringSafe(new Date());

  // Revoke the found session if present (idempotent if none)
  if (activeSession) {
    await MyGlobal.prisma.community_platform_sessions.update({
      where: { id: activeSession.id },
      data: {
        revoked_at: now,
        updated_at: now,
      },
    });
  }

  // Append audit log (event: logout)
  await MyGlobal.prisma.community_platform_audit_logs.create({
    data: {
      id: v4(),
      actor_user_id: systemAdmin.id,
      // include session id only when it exists
      ...(activeSession ? { session_id: activeSession.id } : {}),
      event_type: "logout",
      success: true,
      details: activeSession
        ? "Session revoked successfully"
        : "No active session to revoke",
      ip: null,
      user_agent: null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    },
  });

  return {
    ok: true,
    revoked_at: now,
    // Optional session identifier: omit branded casting by returning null when not exposing
    session_id: null,
    message: activeSession
      ? "Signed out successfully"
      : "No active session was found; nothing to revoke",
  };
}
