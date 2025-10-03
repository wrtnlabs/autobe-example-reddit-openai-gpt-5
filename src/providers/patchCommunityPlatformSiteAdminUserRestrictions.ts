import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ICommunityPlatformUserRestriction } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUserRestriction";
import { IEUserRestrictionType } from "@ORGANIZATION/PROJECT-api/lib/structures/IEUserRestrictionType";
import { IEUserRestrictionSortBy } from "@ORGANIZATION/PROJECT-api/lib/structures/IEUserRestrictionSortBy";
import { IEOrderDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IEOrderDirection";
import { IPageICommunityPlatformUserRestriction } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformUserRestriction";
import { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import { SiteadminPayload } from "../decorators/payload/SiteadminPayload";

export async function patchCommunityPlatformSiteAdminUserRestrictions(props: {
  siteAdmin: SiteadminPayload;
  body: ICommunityPlatformUserRestriction.IRequest;
}): Promise<IPageICommunityPlatformUserRestriction> {
  const { siteAdmin, body } = props;

  // Authentication & Authorization
  if (!siteAdmin || !siteAdmin.id) {
    throw new HttpException("Please sign in to continue.", 401);
  }
  const admin = await MyGlobal.prisma.community_platform_siteadmins.findFirst({
    where: {
      community_platform_user_id: siteAdmin.id,
      revoked_at: null,
      deleted_at: null,
      user: { deleted_at: null },
    },
  });
  if (admin === null) {
    throw new HttpException(
      "Forbidden: Site administrator privileges required",
      403,
    );
  }

  // Sorting & pagination params
  const sortKey: "created_at" | "assigned_at" | "restricted_until" =
    body.sortBy === "assignedAt"
      ? "assigned_at"
      : body.sortBy === "restrictedUntil"
        ? "restricted_until"
        : "created_at";
  const sortOrder: "asc" | "desc" = body.order === "asc" ? "asc" : "desc";
  const limit = (() => {
    const raw = Number(body.limit ?? 20);
    if (Number.isNaN(raw)) return 20;
    if (raw < 1) return 1;
    if (raw > 100) return 100;
    return raw;
  })();

  // Base filters (exclude soft-deleted records by default)
  const baseWhere = {
    deleted_at: null,
    ...(body.activeOnly === true && { revoked_at: null }),
    ...(body.restrictionType !== undefined &&
      body.restrictionType !== null && {
        restriction_type: body.restrictionType,
      }),
    ...(body.userId !== undefined &&
      body.userId !== null && {
        community_platform_user_id: body.userId,
      }),
    // assigned_at range
    ...((body.assignedFrom !== undefined && body.assignedFrom !== null) ||
    (body.assignedTo !== undefined && body.assignedTo !== null)
      ? {
          assigned_at: {
            ...(body.assignedFrom !== undefined &&
              body.assignedFrom !== null && {
                gte: toISOStringSafe(body.assignedFrom),
              }),
            ...(body.assignedTo !== undefined &&
              body.assignedTo !== null && {
                lte: toISOStringSafe(body.assignedTo),
              }),
          },
        }
      : {}),
    // restricted_until range
    ...((body.restrictedUntilFrom !== undefined &&
      body.restrictedUntilFrom !== null) ||
    (body.restrictedUntilTo !== undefined && body.restrictedUntilTo !== null)
      ? {
          restricted_until: {
            ...(body.restrictedUntilFrom !== undefined &&
              body.restrictedUntilFrom !== null && {
                gte: toISOStringSafe(body.restrictedUntilFrom),
              }),
            ...(body.restrictedUntilTo !== undefined &&
              body.restrictedUntilTo !== null && {
                lte: toISOStringSafe(body.restrictedUntilTo),
              }),
          },
        }
      : {}),
  };

  // Execute queries
  const [rows, total] = await Promise.all([
    MyGlobal.prisma.community_platform_guestvisitors.findMany({
      where: baseWhere,
      orderBy: [
        sortKey === "created_at"
          ? { created_at: sortOrder }
          : sortKey === "assigned_at"
            ? { assigned_at: sortOrder }
            : { restricted_until: sortOrder },
        { id: sortOrder },
      ],
      take: limit,
      skip: body.cursor !== undefined && body.cursor !== null ? 1 : 0,
      ...(body.cursor !== undefined &&
        body.cursor !== null && {
          cursor: { id: body.cursor },
        }),
      select: {
        id: true,
        community_platform_user_id: true,
        restriction_type: true,
        restricted_until: true,
        restriction_reason: true,
        assigned_at: true,
        revoked_at: true,
        created_at: true,
        updated_at: true,
      },
    }),
    MyGlobal.prisma.community_platform_guestvisitors.count({
      where: baseWhere,
    }),
  ]);

  // Transform results
  const data: ICommunityPlatformUserRestriction[] = rows.map((r) => ({
    id: r.id as string & tags.Format<"uuid">,
    userId: r.community_platform_user_id as string & tags.Format<"uuid">,
    restrictionType: r.restriction_type as IEUserRestrictionType,
    restrictedUntil: r.restricted_until
      ? toISOStringSafe(r.restricted_until)
      : null,
    restrictionReason: r.restriction_reason ?? null,
    assignedAt: toISOStringSafe(r.assigned_at),
    revokedAt: r.revoked_at ? toISOStringSafe(r.revoked_at) : null,
    createdAt: toISOStringSafe(r.created_at),
    updatedAt: toISOStringSafe(r.updated_at),
  }));

  // Pagination info
  const pagination: IPage.IPagination = {
    current: Number(0),
    limit: Number(limit),
    records: Number(total),
    pages: Number(Math.ceil(total / (limit || 1))),
  };

  return {
    pagination,
    data,
  };
}
