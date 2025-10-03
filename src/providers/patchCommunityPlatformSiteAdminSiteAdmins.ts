import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ICommunityPlatformSiteAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSiteAdmin";
import { IECommunityPlatformSiteAdminSort } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformSiteAdminSort";
import { IEOrderDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IEOrderDirection";
import { IPageICommunityPlatformSiteAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformSiteAdmin";
import { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import { SiteadminPayload } from "../decorators/payload/SiteadminPayload";

export async function patchCommunityPlatformSiteAdminSiteAdmins(props: {
  siteAdmin: SiteadminPayload;
  body: ICommunityPlatformSiteAdmin.IRequest;
}): Promise<IPageICommunityPlatformSiteAdmin.ISummary> {
  /**
   * List/search site administrator assignments (community_platform_siteadmins).
   *
   * Retrieves a paginated collection of admin role assignments with filtering,
   * sorting, and cursor-based pagination. Requires siteAdmin authentication.
   *
   * Authorization: Only authenticated siteAdmin may access.
   *
   * @param props - Request properties
   * @param props.siteAdmin - Authenticated site admin payload
   * @param props.body - Search criteria, sorting, and pagination options
   * @returns Paginated list of site admin assignment summaries
   * @throws {HttpException} 401 when unauthenticated or invalid role
   * @throws {HttpException} 400 on invalid filters or malformed cursor
   */
  const { siteAdmin, body } = props;

  // Authorization check (defense-in-depth)
  if (!siteAdmin || siteAdmin.type !== "siteadmin") {
    throw new HttpException("Please sign in to continue.", 401);
  }

  // Defaults
  const sortBy: IECommunityPlatformSiteAdminSort = body.sort_by ?? "granted_at";
  const order: IEOrderDirection = body.order ?? "desc";
  const limit: number = Number(body.limit ?? 20);

  if (limit <= 0 || limit > 100) {
    throw new HttpException(
      "Bad Request: limit must be between 1 and 100",
      400,
    );
  }

  // Validate date range filters
  if (
    body.granted_at_from &&
    body.granted_at_to &&
    body.granted_at_from > body.granted_at_to
  ) {
    throw new HttpException(
      "Bad Request: granted_at_from must be <= granted_at_to",
      400,
    );
  }
  if (
    !body.active_only &&
    body.revoked_at_from &&
    body.revoked_at_to &&
    body.revoked_at_from > body.revoked_at_to
  ) {
    throw new HttpException(
      "Bad Request: revoked_at_from must be <= revoked_at_to",
      400,
    );
  }

  // Build base where condition
  const whereBase = {
    deleted_at: null,
    ...(body.community_platform_user_id !== undefined && {
      community_platform_user_id: body.community_platform_user_id,
    }),
    ...(body.granted_at_from !== undefined || body.granted_at_to !== undefined
      ? {
          granted_at: {
            ...(body.granted_at_from !== undefined && {
              gte: body.granted_at_from,
            }),
            ...(body.granted_at_to !== undefined && {
              lte: body.granted_at_to,
            }),
          },
        }
      : {}),
    ...(body.active_only === true ? { revoked_at: null } : {}),
    ...(!body.active_only &&
    (body.revoked_at_from !== undefined || body.revoked_at_to !== undefined)
      ? {
          revoked_at: {
            ...(body.revoked_at_from !== undefined && {
              gte: body.revoked_at_from,
            }),
            ...(body.revoked_at_to !== undefined && {
              lte: body.revoked_at_to,
            }),
          },
        }
      : {}),
  } as Record<string, unknown>;

  // Parse cursor if provided (supports keyset pagination)
  let keysetFilter: Record<string, unknown> = {};
  if (body.cursor) {
    let decoded: {
      primary: string;
      id: string;
      sort_by: IECommunityPlatformSiteAdminSort;
      order: IEOrderDirection;
    } | null = null;
    try {
      const json = Buffer.from(body.cursor, "base64").toString("utf8");
      const obj = JSON.parse(json) as Record<string, unknown>;
      const cursorSortBy = (
        obj["sort_by"] === "created_at" ? "created_at" : "granted_at"
      ) as IECommunityPlatformSiteAdminSort;
      const cursorOrder = (
        obj["order"] === "asc" ? "asc" : "desc"
      ) as IEOrderDirection;
      const primary = typeof obj["primary"] === "string" ? obj["primary"] : "";
      const id = typeof obj["id"] === "string" ? obj["id"] : "";
      if (!primary || !id) throw new Error("invalid cursor");
      decoded = { primary, id, sort_by: cursorSortBy, order: cursorOrder };
    } catch {
      throw new HttpException("Bad Request: Malformed cursor", 400);
    }

    // Enforce that cursor matches current sort config
    if (decoded.sort_by !== sortBy || decoded.order !== order) {
      throw new HttpException(
        "Bad Request: Cursor does not match sort configuration",
        400,
      );
    }

    const cmpPrimary = order === "desc" ? "lt" : "gt";
    const cmpId = order === "desc" ? "lt" : "gt";

    keysetFilter = {
      OR: [
        { [sortBy]: { [cmpPrimary]: decoded.primary } },
        {
          AND: [{ [sortBy]: decoded.primary }, { id: { [cmpId]: decoded.id } }],
        },
      ],
    } as Record<string, unknown>;
  }

  // Queries: count total (without cursor) and list page (with cursor)
  const [total, rows] = await Promise.all([
    MyGlobal.prisma.community_platform_siteadmins.count({
      where: whereBase,
    }),
    MyGlobal.prisma.community_platform_siteadmins.findMany({
      where: {
        ...whereBase,
        ...keysetFilter,
      },
      orderBy: [{ [sortBy]: order }, { id: "desc" }],
      take: limit,
    }),
  ]);

  // Map to DTO
  const data = rows.map((r) => {
    const grantedAt = toISOStringSafe(r.granted_at);
    const createdAt = toISOStringSafe(r.created_at);
    const updatedAt = toISOStringSafe(r.updated_at);
    const revokedAt = r.revoked_at ? toISOStringSafe(r.revoked_at) : null;
    const deletedAt = r.deleted_at ? toISOStringSafe(r.deleted_at) : null;
    const isActive = revokedAt === null && deletedAt === null;

    return {
      id: r.id as string & tags.Format<"uuid">,
      userId: r.community_platform_user_id as string & tags.Format<"uuid">,
      grantedAt,
      revokedAt,
      createdAt,
      updatedAt,
      deletedAt,
      isActive,
    } satisfies ICommunityPlatformSiteAdmin.ISummary;
  });

  // Pagination block
  const pages = limit > 0 ? Math.ceil(total / limit) : 0;
  const pagination: IPage.IPagination = {
    current: Number(body.cursor ? 2 : 1),
    limit: Number(limit),
    records: Number(total),
    pages: Number(pages),
  };

  return {
    pagination,
    data,
  };
}
