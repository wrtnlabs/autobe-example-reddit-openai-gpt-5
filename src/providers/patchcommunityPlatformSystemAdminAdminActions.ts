import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ICommunityPlatformAdminAction } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformAdminAction";
import { IPageICommunityPlatformAdminAction } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformAdminAction";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

export async function patchcommunityPlatformSystemAdminAdminActions(props: {
  systemAdmin: SystemadminPayload;
  body: ICommunityPlatformAdminAction.IRequest;
}): Promise<IPageICommunityPlatformAdminAction.ISummary> {
  /**
   * List administrative actions from community_platform_admin_actions
   *
   * Retrieves paginated, filterable summaries of administrative action
   * snapshots for audit and review. Only platform system administrators are
   * authorized. Records with deleted_at are excluded. Supports filtering by
   * actor and optional targets, action keys, free-text search
   * (reason/ip/user_agent), time range, and sorting (default created_at desc).
   *
   * @param props - Request properties
   * @param props.systemAdmin - The authenticated system admin payload
   * @param props.body - Pagination, filters, and ordering options
   * @returns Paginated list of administrative action summaries
   * @throws {HttpException} 403 when caller is not a valid system admin
   */
  const { systemAdmin, body } = props;

  // Authorization: must be a verified active system admin
  if (!systemAdmin || systemAdmin.type !== "systemadmin")
    throw new HttpException("Forbidden", 403);

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

  // Pagination defaults and safety
  const pageRaw = body.page ?? 1;
  let page = Number(pageRaw);
  if (!Number.isFinite(page) || page < 1) page = 1;

  const limitRaw = body.limit ?? 20;
  let limit = Number(limitRaw);
  if (!Number.isFinite(limit) || limit < 1) limit = 20;

  const direction = body.direction ?? "desc"; // "asc" | "desc"
  const orderByField = body.orderBy ?? "created_at"; // allowed fields

  // Build complex where condition (allowed pattern)
  const whereCondition = {
    deleted_at: null,
    // Exact match filters (UUIDs)
    ...(body.actor_user_id !== undefined &&
      body.actor_user_id !== null && {
        actor_user_id: body.actor_user_id,
      }),
    ...(body.target_community_id !== undefined &&
      body.target_community_id !== null && {
        target_community_id: body.target_community_id,
      }),
    ...(body.target_post_id !== undefined &&
      body.target_post_id !== null && {
        target_post_id: body.target_post_id,
      }),
    ...(body.target_comment_id !== undefined &&
      body.target_comment_id !== null && {
        target_comment_id: body.target_comment_id,
      }),
    // Actions filter
    ...(() => {
      const actions = body.actions;
      if (actions !== undefined && actions !== null && actions.length > 0)
        return { action: { in: actions } };
      return {};
    })(),
    // Date range filter
    ...(() => {
      const from = body.from ?? null;
      const to = body.to ?? null;
      if (from === null && to === null) return {};
      return {
        created_at: {
          ...(from !== null ? { gte: toISOStringSafe(from) } : {}),
          ...(to !== null ? { lte: toISOStringSafe(to) } : {}),
        },
      };
    })(),
    // Free-text search across reason/ip/user_agent
    ...(() => {
      const search = body.search ?? null;
      if (search === null || search.length === 0) return {};
      return {
        OR: [
          { reason: { contains: search } },
          { ip: { contains: search } },
          { user_agent: { contains: search } },
        ],
      };
    })(),
  };

  const [rows, total] = await Promise.all([
    MyGlobal.prisma.community_platform_admin_actions.findMany({
      where: whereCondition,
      select: {
        id: true,
        actor_user_id: true,
        target_community_id: true,
        target_post_id: true,
        target_comment_id: true,
        action: true,
        reason: true,
        created_at: true,
      },
      orderBy:
        orderByField === "created_at"
          ? { created_at: direction }
          : orderByField === "action"
            ? { action: direction }
            : { actor_user_id: direction },
      skip: (page - 1) * limit,
      take: limit,
    }),
    MyGlobal.prisma.community_platform_admin_actions.count({
      where: whereCondition,
    }),
  ]);

  const data = rows.map((r) =>
    typia.assert<ICommunityPlatformAdminAction.ISummary>({
      id: r.id,
      action: r.action,
      actor_user_id: r.actor_user_id,
      target_community_id: r.target_community_id ?? null,
      target_post_id: r.target_post_id ?? null,
      target_comment_id: r.target_comment_id ?? null,
      reason: r.reason ?? null,
      created_at: toISOStringSafe(r.created_at),
    }),
  );

  const pagination = typia.assert<IPage.IPagination>({
    current: Number(page),
    limit: Number(limit),
    records: Number(total),
    pages: Number(Math.ceil(total / limit)),
  });

  return typia.assert<IPageICommunityPlatformAdminAction.ISummary>({
    pagination,
    data,
  });
}
