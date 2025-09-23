import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ICommunityPlatformAuditLog } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformAuditLog";
import { IPageICommunityPlatformAuditLog } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformAuditLog";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

/**
 * Search and paginate administrative audit logs
 * (community_platform_audit_logs).
 *
 * Retrieves a paginated, filterable list of audit entries for investigative and
 * compliance workflows. Supports filters by event types, time ranges, success
 * flag, actor (via me_only or actor_username), and related resource IDs.
 * Results exclude soft-deleted records by default and are sorted with
 * deterministic tie-breaking.
 *
 * Authorization: only active system admins may access this endpoint.
 * Verification is performed against community_platform_systemadmins and the
 * linked user state.
 *
 * @param props - Request properties
 * @param props.systemAdmin - The authenticated system admin payload
 * @param props.body - Search criteria, sorting, and pagination options
 * @returns Paginated list of audit log summaries
 * @throws {HttpException} 403 when requester is not an active system admin
 */
export async function patchcommunityPlatformSystemAdminAuditLogs(props: {
  systemAdmin: SystemadminPayload;
  body: ICommunityPlatformAuditLog.IRequest;
}): Promise<IPageICommunityPlatformAuditLog.ISummary> {
  const { systemAdmin, body } = props;

  // Authorization: verify active system admin role
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
  if (admin === null) throw new HttpException("Forbidden", 403);

  // Pagination defaults
  const page = body.page ?? 1;
  const limit = body.limit ?? 20;
  const skip = (page - 1) * limit;

  // Build where condition
  const whereCondition = {
    deleted_at: null,
    // Me-only scope
    ...(body.me_only === true && { actor_user_id: systemAdmin.id }),

    // Relation-based actor username filter
    ...(body.actor_username !== undefined &&
      body.actor_username !== null &&
      body.actor_username !== "" && {
        actorUser: { is: { username: body.actor_username } },
      }),

    // Simple equality filters
    ...(body.session_id !== undefined && { session_id: body.session_id }),
    ...(body.community_id !== undefined && { community_id: body.community_id }),
    ...(body.post_id !== undefined && { post_id: body.post_id }),
    ...(body.comment_id !== undefined && { comment_id: body.comment_id }),
    ...(body.membership_id !== undefined && {
      membership_id: body.membership_id,
    }),

    // Event types filter
    ...(Array.isArray(body.event_types) &&
      body.event_types.length > 0 && {
        event_type: { in: body.event_types },
      }),

    // Success flag
    ...(body.success !== undefined && { success: body.success }),

    // Created_at range
    ...(body.created_at_from !== undefined || body.created_at_to !== undefined
      ? {
          created_at: {
            ...(body.created_at_from !== undefined && {
              gte: toISOStringSafe(body.created_at_from),
            }),
            ...(body.created_at_to !== undefined && {
              lte: toISOStringSafe(body.created_at_to),
            }),
          },
        }
      : {}),
  };

  // Sorting defaults
  const primaryOrder = body.order_by ?? "created_at";
  const direction =
    body.direction ?? (primaryOrder === "created_at" ? "desc" : "asc");

  const [rows, total] = await Promise.all([
    MyGlobal.prisma.community_platform_audit_logs.findMany({
      where: whereCondition,
      select: {
        id: true,
        event_type: true,
        success: true,
        actor_user_id: true,
        session_id: true,
        guestvisitor_id: true,
        community_id: true,
        post_id: true,
        comment_id: true,
        membership_id: true,
        created_at: true,
      },
      orderBy:
        primaryOrder === "created_at"
          ? [{ created_at: direction }, { id: "desc" }]
          : primaryOrder === "event_type"
            ? [{ event_type: direction }, { id: "desc" }]
            : primaryOrder === "success"
              ? [{ success: direction }, { id: "desc" }]
              : [{ actorUser: { username: direction } }, { id: "desc" }],
      skip,
      take: limit,
    }),
    MyGlobal.prisma.community_platform_audit_logs.count({
      where: whereCondition,
    }),
  ]);

  // Map to summaries
  const data = rows.map((r) => ({
    id: r.id,
    event_type: r.event_type,
    success: r.success,
    actor_user_id: r.actor_user_id ?? null,
    session_id: r.session_id ?? null,
    guestvisitor_id: r.guestvisitor_id ?? null,
    community_id: r.community_id ?? null,
    post_id: r.post_id ?? null,
    comment_id: r.comment_id ?? null,
    membership_id: r.membership_id ?? null,
    created_at: toISOStringSafe(r.created_at),
  }));

  const pages = limit > 0 ? Math.ceil(total / limit) : 0;

  return {
    pagination: {
      current: Number(page),
      limit: Number(limit),
      records: total,
      pages: Number(pages),
    },
    data,
  };
}
