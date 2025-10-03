import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ICommunityPlatformRegisteredMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRegisteredMember";
import { IECommunityPlatformRegisteredMemberSort } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformRegisteredMemberSort";
import { IEOrderDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IEOrderDirection";
import { IPageICommunityPlatformRegisteredMember } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformRegisteredMember";
import { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import { SiteadminPayload } from "../decorators/payload/SiteadminPayload";

export async function patchCommunityPlatformSiteAdminRegisteredMembers(props: {
  siteAdmin: SiteadminPayload;
  body: ICommunityPlatformRegisteredMember.IRequest;
}): Promise<IPageICommunityPlatformRegisteredMember.ISummary> {
  // Authorization guards
  if (!props.siteAdmin) {
    throw new HttpException("Please sign in to continue.", 401);
  }
  const activeAdmin =
    await MyGlobal.prisma.community_platform_siteadmins.findFirst({
      where: {
        community_platform_user_id: props.siteAdmin.id,
        revoked_at: null,
        deleted_at: null,
        user: { deleted_at: null },
      },
    });
  if (activeAdmin === null) {
    throw new HttpException(
      "Forbidden: Administrative privileges required",
      403,
    );
  }

  const body = props.body;

  // Defaults
  const sortBy: IECommunityPlatformRegisteredMemberSort =
    body.sort_by === "registered_at" ? "registered_at" : "created_at";
  const order: IEOrderDirection = body.order === "asc" ? "asc" : "desc";
  const take: number = Number(body.limit ?? 20);

  // Build base where conditions (excluding cursor)
  const baseWhere = {
    ...(body.community_platform_user_id !== undefined && {
      community_platform_user_id: body.community_platform_user_id,
    }),
    // Default active_only true → filter out soft-deleted rows
    ...((body.active_only === undefined || body.active_only === true) && {
      deleted_at: null,
    }),
    ...((body.registered_at_from !== undefined &&
      body.registered_at_from !== null) ||
    (body.registered_at_to !== undefined && body.registered_at_to !== null)
      ? {
          registered_at: {
            ...(body.registered_at_from !== undefined &&
              body.registered_at_from !== null && {
                gte: body.registered_at_from,
              }),
            ...(body.registered_at_to !== undefined &&
              body.registered_at_to !== null && {
                lte: body.registered_at_to,
              }),
          },
        }
      : {}),
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
  };

  // Parse cursor, support either raw JSON or base64-encoded JSON
  let cursorFieldValue: (string & tags.Format<"date-time">) | undefined;
  let cursorId: (string & tags.Format<"uuid">) | undefined;
  if (body.cursor !== undefined && body.cursor !== null) {
    try {
      const raw = body.cursor;
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        const decoded = Buffer.from(raw, "base64").toString("utf8");
        parsed = JSON.parse(decoded);
      }
      const obj = parsed as Record<string, unknown>;
      const idVal = typeof obj.id === "string" ? (obj.id as string) : undefined;
      const createdAtVal =
        typeof obj.created_at === "string"
          ? (obj.created_at as string)
          : undefined;
      const registeredAtVal =
        typeof obj.registered_at === "string"
          ? (obj.registered_at as string)
          : undefined;

      if (
        idVal &&
        ((sortBy === "created_at" && createdAtVal) ||
          (sortBy === "registered_at" && registeredAtVal))
      ) {
        cursorId = idVal as string & tags.Format<"uuid">;
        cursorFieldValue = (
          sortBy === "created_at" ? createdAtVal! : registeredAtVal!
        ) as string & tags.Format<"date-time">;
      }
    } catch {
      // Ignore malformed cursor and proceed without it
    }
  }

  // Compose where with cursor if present
  const whereWithCursor = {
    ...baseWhere,
    ...(cursorFieldValue !== undefined && cursorId !== undefined
      ? {
          OR: [
            sortBy === "created_at"
              ? {
                  created_at:
                    order === "desc"
                      ? { lt: cursorFieldValue }
                      : { gt: cursorFieldValue },
                }
              : {
                  registered_at:
                    order === "desc"
                      ? { lt: cursorFieldValue }
                      : { gt: cursorFieldValue },
                },
            sortBy === "created_at"
              ? {
                  AND: [
                    { created_at: { equals: cursorFieldValue } },
                    {
                      id:
                        order === "desc" ? { lt: cursorId } : { gt: cursorId },
                    },
                  ],
                }
              : {
                  AND: [
                    { registered_at: { equals: cursorFieldValue } },
                    {
                      id:
                        order === "desc" ? { lt: cursorId } : { gt: cursorId },
                    },
                  ],
                },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    MyGlobal.prisma.community_platform_registeredmembers.findMany({
      where: whereWithCursor,
      select: {
        id: true,
        community_platform_user_id: true,
        registered_at: true,
        created_at: true,
        updated_at: true,
        deleted_at: true,
      },
      orderBy:
        sortBy === "created_at"
          ? [{ created_at: order }, { id: order }]
          : [{ registered_at: order }, { id: order }],
      take,
    }),
    MyGlobal.prisma.community_platform_registeredmembers.count({
      where: baseWhere,
    }),
  ]);

  const data = rows.map((r) => ({
    id: r.id as string & tags.Format<"uuid">,
    userId: r.community_platform_user_id as string & tags.Format<"uuid">,
    registeredAt: toISOStringSafe(r.registered_at),
    createdAt: toISOStringSafe(r.created_at),
    updatedAt: toISOStringSafe(r.updated_at),
    deletedAt: r.deleted_at ? toISOStringSafe(r.deleted_at) : null,
    isActive: r.deleted_at === null,
  }));

  const limitNum = Number(take);
  const records = Number(total);
  const pages = limitNum > 0 ? Math.ceil(records / limitNum) : 0;

  return {
    pagination: {
      current: Number(0),
      limit: Number(limitNum),
      records: Number(records),
      pages: Number(pages),
    },
    data,
  };
}
