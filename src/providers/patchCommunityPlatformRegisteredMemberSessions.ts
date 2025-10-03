import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ICommunityPlatformSession } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSession";
import { IECommunityPlatformSessionStatus } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformSessionStatus";
import { IECommunityPlatformSessionSort } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformSessionSort";
import { IEOrderDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IEOrderDirection";
import { IPageICommunityPlatformSession } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformSession";
import { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import { RegisteredmemberPayload } from "../decorators/payload/RegisteredmemberPayload";

export async function patchCommunityPlatformRegisteredMemberSessions(props: {
  registeredMember: RegisteredmemberPayload;
  body: ICommunityPlatformSession.IRequest;
}): Promise<IPageICommunityPlatformSession.ISummary> {
  const { registeredMember, body } = props;

  if (!registeredMember || !registeredMember.id) {
    throw new HttpException("Please sign in to continue.", 401);
  }

  const now: string & tags.Format<"date-time"> = toISOStringSafe(new Date());

  // Normalize inputs
  const status: IECommunityPlatformSessionStatus = body.status ?? "active";
  const sortBy: IECommunityPlatformSessionSort = body.sort_by ?? "last_seen_at";
  const order: IEOrderDirection = body.order ?? "desc";
  const limitNum: number = typeof body.limit === "number" ? body.limit : 20;
  const take: number = Math.max(1, Math.min(100, Number(limitNum)));

  // Build WHERE conditions
  const whereCondition = {
    community_platform_user_id: registeredMember.id,
    deleted_at: null,
    // Lifecycle status
    ...(() => {
      switch (status) {
        case "active":
          return { revoked_at: null, expires_at: { gt: now } };
        case "revoked":
          return { NOT: { revoked_at: null } };
        case "expired":
          return { revoked_at: null, expires_at: { lte: now } };
        case "all":
        default:
          return {};
      }
    })(),
    // Optional filters
    ...(body.session_type !== undefined &&
      body.session_type !== null && {
        session_type: body.session_type,
      }),
    ...((body.created_at_from !== undefined && body.created_at_from !== null) ||
    (body.created_at_to !== undefined && body.created_at_to !== null)
      ? {
          created_at: {
            ...(body.created_at_from !== undefined &&
              body.created_at_from !== null && {
                gte: body.created_at_from,
              }),
            ...(body.created_at_to !== undefined &&
              body.created_at_to !== null && {
                lte: body.created_at_to,
              }),
          },
        }
      : {}),
    ...((body.last_seen_at_from !== undefined &&
      body.last_seen_at_from !== null) ||
    (body.last_seen_at_to !== undefined && body.last_seen_at_to !== null)
      ? {
          last_seen_at: {
            ...(body.last_seen_at_from !== undefined &&
              body.last_seen_at_from !== null && {
                gte: body.last_seen_at_from,
              }),
            ...(body.last_seen_at_to !== undefined &&
              body.last_seen_at_to !== null && {
                lte: body.last_seen_at_to,
              }),
          },
        }
      : {}),
    ...((body.expires_at_from !== undefined && body.expires_at_from !== null) ||
    (body.expires_at_to !== undefined && body.expires_at_to !== null)
      ? {
          expires_at: {
            ...(body.expires_at_from !== undefined &&
              body.expires_at_from !== null && {
                gte: body.expires_at_from,
              }),
            ...(body.expires_at_to !== undefined &&
              body.expires_at_to !== null && {
                lte: body.expires_at_to,
              }),
          },
        }
      : {}),
  };

  // Determine sorting
  const orderBy =
    sortBy === "last_seen_at"
      ? [
          { last_seen_at: order },
          { created_at: order },
          { id: "desc" as const },
        ]
      : sortBy === "expires_at"
        ? [{ expires_at: order }, { id: "desc" as const }]
        : [{ created_at: order }, { id: "desc" as const }];

  const [rows, total] = await Promise.all([
    MyGlobal.prisma.community_platform_sessions.findMany({
      where: whereCondition,
      orderBy: orderBy,
      take,
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
    }),
    MyGlobal.prisma.community_platform_sessions.count({
      where: whereCondition,
    }),
  ]);

  const data: ICommunityPlatformSession.ISummary[] = rows.map((r) => ({
    id: r.id as string & tags.Format<"uuid">,
    userId: r.community_platform_user_id as string & tags.Format<"uuid">,
    userAgent: r.user_agent ?? null,
    ip: r.ip ?? null,
    clientPlatform: r.client_platform ?? null,
    clientDevice: r.client_device ?? null,
    sessionType: r.session_type ?? null,
    createdAt: toISOStringSafe(r.created_at),
    updatedAt: toISOStringSafe(r.updated_at),
    lastSeenAt: r.last_seen_at ? toISOStringSafe(r.last_seen_at) : null,
    expiresAt: toISOStringSafe(r.expires_at),
    revokedAt: r.revoked_at ? toISOStringSafe(r.revoked_at) : null,
    deletedAt: r.deleted_at ? toISOStringSafe(r.deleted_at) : null,
    isActive:
      (r.revoked_at ? false : true) &&
      toISOStringSafe(r.expires_at) > now &&
      (r.deleted_at ? false : true),
  }));

  return {
    pagination: {
      current: Number(0),
      limit: Number(take),
      records: Number(total),
      pages: Number(Math.ceil((total || 0) / (take || 1))),
    },
    data,
  };
}
