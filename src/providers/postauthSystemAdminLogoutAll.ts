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
 * Revoke all admin sessions by updating revoked_at across
 * community_platform_sessions for the user.
 *
 * This operation invalidates every active session belonging to the
 * authenticated system administrator by setting revoked_at (and updated_at) on
 * all non-revoked, non-deleted sessions whose expires_at is in the future. It
 * also records an audit log entry with event_type "logout_all".
 *
 * Authorization: Only the authenticated systemAdmin can revoke their own
 * sessions.
 *
 * @param props - Request properties
 * @param props.systemAdmin - The authenticated system administrator payload
 *   (user id and role)
 * @returns Confirmation DTO containing operation status, revoked count, and the
 *   revocation timestamp
 * @throws {HttpException} 401 When authentication payload is missing
 * @throws {HttpException} 403 When caller is not a valid active system admin
 */
export async function postauthSystemAdminLogoutAll(props: {
  systemAdmin: SystemadminPayload;
}): Promise<ICommunityPlatformSystemAdmin.ISignOutAll> {
  const { systemAdmin } = props;
  if (!systemAdmin) {
    throw new HttpException("Unauthorized", 401);
  }
  if (systemAdmin.type !== "systemadmin") {
    throw new HttpException("Forbidden", 403);
  }

  // Ensure the caller is still an active system admin
  const adminRow =
    await MyGlobal.prisma.community_platform_systemadmins.findFirst({
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
    });
  if (adminRow === null) {
    throw new HttpException("Forbidden", 403);
  }

  const now = toISOStringSafe(new Date());

  // Revoke all active (unrevoked, not deleted, unexpired) sessions
  const result = await MyGlobal.prisma.community_platform_sessions.updateMany({
    where: {
      community_platform_user_id: systemAdmin.id,
      revoked_at: null,
      deleted_at: null,
      expires_at: { gt: now },
    },
    data: {
      revoked_at: now,
      updated_at: now,
    },
  });

  // Optional audit trail
  await MyGlobal.prisma.community_platform_audit_logs.create({
    data: {
      id: v4() as string & tags.Format<"uuid">,
      actor_user_id: systemAdmin.id,
      session_id: null,
      guestvisitor_id: null,
      community_id: null,
      post_id: null,
      comment_id: null,
      membership_id: null,
      event_type: "logout_all",
      success: true,
      details: null,
      ip: null,
      user_agent: null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    },
  });

  return {
    ok: true,
    count: result.count as number & tags.Type<"int32"> & tags.Minimum<0>,
    revoked_at: now,
    message: "All sessions revoked for the administrator.",
  };
}
