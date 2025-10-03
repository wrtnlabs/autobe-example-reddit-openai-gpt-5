import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";
import { IECommunityCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityCategory";
import { IECommunitySort } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunitySort";
import { IPageICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformCommunity";
import { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";

export async function patchCommunityPlatformCommunities(props: {
  body: ICommunityPlatformCommunity.IRequest;
}): Promise<IPageICommunityPlatformCommunity.ISummary> {
  const { body } = props;

  // Pagination limit with defaults and bounds [1, 100]
  const limit: number = Math.max(1, Math.min(100, Number(body.limit ?? 20)));

  // Build WHERE condition (soft-delete aware) – allowed exception for readability
  const whereCondition = {
    deleted_at: null,
    ...(body.category !== undefined &&
      body.category !== null && {
        category: body.category,
      }),
    ...(body.q !== undefined &&
      body.q !== null &&
      body.q.trim().length >= 2 && {
        OR: [
          { name: { contains: body.q } },
          { description: { contains: body.q } },
        ],
      }),
  };

  // Fetch total count and current slice in parallel
  const [total, rows] = await Promise.all([
    MyGlobal.prisma.community_platform_communities.count({
      where: whereCondition,
    }),
    MyGlobal.prisma.community_platform_communities.findMany({
      where: whereCondition,
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      take: limit,
      skip: 0,
      select: {
        id: true,
        name: true,
        category: true,
        description: true,
        logo_uri: true,
        last_active_at: true,
        created_at: true,
      },
    }),
  ]);

  // Compute member counts for listed communities
  const ids = rows.map((r) => r.id);
  const countsMap = new Map<string, number>();
  if (ids.length > 0) {
    const grouped =
      await MyGlobal.prisma.community_platform_community_members.groupBy({
        by: ["community_platform_community_id"],
        where: {
          community_platform_community_id: { in: ids },
          deleted_at: null,
        },
        _count: { _all: true },
      });
    for (const g of grouped)
      countsMap.set(g.community_platform_community_id, g._count._all);
  }

  // Map to DTO summaries
  const data = rows.map((row) => ({
    id: row.id as string & tags.Format<"uuid">,
    name: row.name,
    category: row.category as IECommunityCategory,
    description:
      row.description === null
        ? null
        : (row.description as string & tags.MaxLength<500>),
    logoUrl:
      row.logo_uri === null
        ? null
        : (row.logo_uri as string & tags.Format<"uri">),
    memberCount: countsMap.get(row.id) ?? 0,
    createdAt: toISOStringSafe(row.created_at),
    lastActiveAt: row.last_active_at
      ? toISOStringSafe(row.last_active_at)
      : null,
  }));

  // Pagination block (cursorless; current page fixed to 0)
  const pagination = {
    current: 0,
    limit: Number(limit),
    records: total,
    pages: total === 0 ? 0 : Math.ceil(total / Number(limit)),
  };

  return { pagination, data };
}
