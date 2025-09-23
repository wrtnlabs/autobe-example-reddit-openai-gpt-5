import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ICommunityPlatformAuditLog } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformAuditLog";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

export async function getcommunityPlatformSystemAdminAuditLogsAuditLogId(props: {
  systemAdmin: SystemadminPayload;
  auditLogId: string & tags.Format<"uuid">;
}): Promise<ICommunityPlatformAuditLog> {
  const { systemAdmin, auditLogId } = props;

  // Authorization: ensure correct role discriminator
  if (!systemAdmin || systemAdmin.type !== "systemadmin") {
    throw new HttpException("Forbidden", 403);
  }

  // Verify active system admin assignment and active user
  const activeAdmin =
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
  if (activeAdmin === null) {
    throw new HttpException("Forbidden", 403);
  }

  // Fetch the audit log record; exclude soft-deleted entries
  const record = await MyGlobal.prisma.community_platform_audit_logs.findFirst({
    where: {
      id: auditLogId,
      deleted_at: null,
    },
    select: {
      id: true,
      actor_user_id: true,
      session_id: true,
      guestvisitor_id: true,
      community_id: true,
      post_id: true,
      comment_id: true,
      membership_id: true,
      event_type: true,
      success: true,
      details: true,
      ip: true,
      user_agent: true,
      created_at: true,
      updated_at: true,
      deleted_at: true,
    },
  });

  if (record === null) {
    throw new HttpException("Not Found", 404);
  }

  // Map to DTO with strict date conversions and UUID branding via typia.assert
  const result: ICommunityPlatformAuditLog = {
    id: typia.assert<string & tags.Format<"uuid">>(record.id),

    actor_user_id:
      record.actor_user_id !== null
        ? typia.assert<string & tags.Format<"uuid">>(record.actor_user_id)
        : null,
    session_id:
      record.session_id !== null
        ? typia.assert<string & tags.Format<"uuid">>(record.session_id)
        : null,
    guestvisitor_id:
      record.guestvisitor_id !== null
        ? typia.assert<string & tags.Format<"uuid">>(record.guestvisitor_id)
        : null,
    community_id:
      record.community_id !== null
        ? typia.assert<string & tags.Format<"uuid">>(record.community_id)
        : null,
    post_id:
      record.post_id !== null
        ? typia.assert<string & tags.Format<"uuid">>(record.post_id)
        : null,
    comment_id:
      record.comment_id !== null
        ? typia.assert<string & tags.Format<"uuid">>(record.comment_id)
        : null,
    membership_id:
      record.membership_id !== null
        ? typia.assert<string & tags.Format<"uuid">>(record.membership_id)
        : null,

    event_type: record.event_type,
    success: record.success,

    details: record.details ?? null,
    ip: record.ip ?? null,
    user_agent: record.user_agent ?? null,

    created_at: toISOStringSafe(record.created_at),
    updated_at: toISOStringSafe(record.updated_at),
    deleted_at: record.deleted_at ? toISOStringSafe(record.deleted_at) : null,
  };

  return result;
}
