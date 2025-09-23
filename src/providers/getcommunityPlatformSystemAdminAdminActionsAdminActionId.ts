import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ICommunityPlatformAdminAction } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformAdminAction";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

/**
 * Get a specific administrative action (community_platform_admin_actions) by
 * ID.
 *
 * Retrieves an immutable administrative action snapshot for audit/policy
 * review. Restricted to system administrators. Returns actor, optional targets
 * (community/post/comment), action key, optional reason, ip, user-agent, and
 * timestamps.
 *
 * Authorization:
 *
 * - Caller must be a verified system administrator.
 * - Verifies active system admin role (not revoked/deleted) and active user
 *   status.
 *
 * @param props - Request properties
 * @param props.systemAdmin - The authenticated system administrator payload
 * @param props.adminActionId - UUID of the admin action to retrieve
 * @returns Administrative action detail snapshot
 * @throws {HttpException} 403 When the caller is not an active system
 *   administrator
 * @throws {HttpException} 404 When the administrative action is not found
 */
export async function getcommunityPlatformSystemAdminAdminActionsAdminActionId(props: {
  systemAdmin: SystemadminPayload;
  adminActionId: string & tags.Format<"uuid">;
}): Promise<ICommunityPlatformAdminAction> {
  const { systemAdmin, adminActionId } = props;

  // Authorization: ensure payload role is systemadmin
  if (!systemAdmin || systemAdmin.type !== "systemadmin") {
    throw new HttpException("Forbidden", 403);
  }

  // Verify active system admin role with soft-delete/revocation and active user
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

  // Fetch the administrative action by ID
  const row = await MyGlobal.prisma.community_platform_admin_actions.findUnique(
    {
      where: { id: adminActionId },
    },
  );
  if (!row) {
    throw new HttpException("Not Found", 404);
  }

  // Map to API structure with proper null/undefined and ISO date conversions
  return {
    id: row.id as string & tags.Format<"uuid">,
    actor_user_id: row.actor_user_id as string & tags.Format<"uuid">,
    target_community_id:
      row.target_community_id === null
        ? undefined
        : (row.target_community_id as string & tags.Format<"uuid">),
    target_post_id:
      row.target_post_id === null
        ? undefined
        : (row.target_post_id as string & tags.Format<"uuid">),
    target_comment_id:
      row.target_comment_id === null
        ? undefined
        : (row.target_comment_id as string & tags.Format<"uuid">),
    action: row.action,
    reason: row.reason === null ? undefined : row.reason,
    ip: row.ip === null ? undefined : row.ip,
    user_agent: row.user_agent === null ? undefined : row.user_agent,
    created_at: toISOStringSafe(row.created_at),
    updated_at: toISOStringSafe(row.updated_at),
    deleted_at: row.deleted_at ? toISOStringSafe(row.deleted_at) : undefined,
  };
}
