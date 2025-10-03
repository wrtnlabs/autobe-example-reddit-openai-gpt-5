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

/**
 * Search communities (community_platform_communities) with Name Match or
 * Recently Created sorting
 *
 * Provides global community search with Name Match ranking or Recently Created
 * ordering. Excludes soft-deleted communities (deleted_at IS NOT NULL).
 * Supports optional category filtering, limit (default 20, max 100), and
 * deterministic ordering.
 *
 * NameMatch ranking (application-level): exact (case-insensitive) > starts-with
 *
 * > Contains, tying by (created_at desc, id desc).
 *
 * Pagination note: API response does not expose cursor; pagination info is
 * provided via IPage.IPagination. `current` is 0 for the current page in this
 * implementation.
 *
 * @param props - Request properties
 * @param props.body - Search parameters (q?, category?, sort?, cursor?, limit?)
 * @returns Paginated list of community summaries with derived memberCount
 * @throws {HttpException} 400 When q is provided but shorter than 2 characters
 *   after trim
 * @throws {HttpException} 500 On unexpected database errors
 */
export async function patchCommunityPlatformSearchCommunities(props: {
  body: ICommunityPlatformCommunity.IRequest;
}): Promise<IPageICommunityPlatformCommunity.ISummary> {
  const { body } = props;

  // Normalize and validate inputs
  const rawQ = body.q?.trim();
  if (rawQ !== undefined && rawQ.length > 0 && rawQ.length < 2) {
    throw new HttpException("Please enter at least 2 characters.", 400);
  }
  const q = rawQ && rawQ.length >= 2 ? rawQ : undefined;

  const sort = body.sort;
  const useRecentlyCreated =
    sort === "recentlyCreated" || sort === "RecentlyCreated";
  // Default for name-based search when not specified
  const useNameMatch = !useRecentlyCreated;

  // Clamp limit to [1, 100], default 20
  const limit = (() => {
    const base = body.limit !== undefined ? Number(body.limit) : 20;
    if (Number.isNaN(base)) return 20;
    if (base < 1) return 1;
    if (base > 100) return 100;
    return base;
  })();

  // Build shared where condition (allowed pattern)
  const whereCondition = {
    deleted_at: null,
    ...(body.category !== undefined &&
      body.category !== null && {
        category: body.category,
      }),
    ...(q !== undefined && q !== null
      ? {
          OR: [{ name: { contains: q } }, { description: { contains: q } }],
        }
      : {}),
  };

  try {
    if (useRecentlyCreated) {
      // Recently Created ordering done in DB; count + page fetch
      const [rows, total] = await Promise.all([
        MyGlobal.prisma.community_platform_communities.findMany({
          where: whereCondition,
          orderBy: [{ created_at: "desc" }, { id: "desc" }],
          select: {
            id: true,
            name: true,
            category: true,
            description: true,
            logo_uri: true,
            created_at: true,
            last_active_at: true,
          },
          take: limit,
        }),
        MyGlobal.prisma.community_platform_communities.count({
          where: whereCondition,
        }),
      ]);

      // member counts in one query
      const ids = rows.map((r) => r.id);
      const counts =
        ids.length === 0
          ? []
          : await MyGlobal.prisma.community_platform_community_members.groupBy({
              by: ["community_platform_community_id"],
              where: {
                community_platform_community_id: { in: ids },
                deleted_at: null,
              },
              _count: { _all: true },
            });
      const countMap = new Map<string, number>();
      for (const c of counts)
        countMap.set(c.community_platform_community_id, c._count._all);

      return {
        pagination: {
          current: 0,
          limit: Number(limit),
          records: Number(total),
          pages: Number(Math.ceil((total || 0) / (limit || 1))),
        },
        data: rows.map((r) => ({
          id: r.id as string & tags.Format<"uuid">,
          name: r.name,
          category: r.category as IECommunityCategory,
          description: r.description ?? null,
          logoUrl: r.logo_uri ?? null,
          memberCount: Number(countMap.get(r.id) ?? 0) as number &
            tags.Type<"int32"> &
            tags.Minimum<0>,
          createdAt: toISOStringSafe(r.created_at),
          lastActiveAt: r.last_active_at
            ? toISOStringSafe(r.last_active_at)
            : null,
        })),
      };
    }

    // NameMatch: fetch all matches (or all when no q), rank and slice in app
    const [allRows, total] = await Promise.all([
      MyGlobal.prisma.community_platform_communities.findMany({
        where: whereCondition,
        select: {
          id: true,
          name: true,
          category: true,
          description: true,
          logo_uri: true,
          created_at: true,
          last_active_at: true,
        },
      }),
      MyGlobal.prisma.community_platform_communities.count({
        where: whereCondition,
      }),
    ]);

    const qLower = (q ?? "").toLowerCase();

    const ranked = allRows
      .map((r) => ({
        rec: r,
        rank: (() => {
          if (!qLower) return 3;
          const nameLower = r.name.toLowerCase();
          if (nameLower === qLower) return 0;
          if (nameLower.startsWith(qLower)) return 1;
          if (nameLower.includes(qLower)) return 2;
          return 3;
        })(),
      }))
      .sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank; // asc (better rank first)
        const aCreated = toISOStringSafe(a.rec.created_at);
        const bCreated = toISOStringSafe(b.rec.created_at);
        if (aCreated < bCreated) return 1; // DESC
        if (aCreated > bCreated) return -1;
        return a.rec.id < b.rec.id ? 1 : a.rec.id > b.rec.id ? -1 : 0; // id DESC
      })
      .slice(0, limit)
      .map((x) => x.rec);

    const ids = ranked.map((r) => r.id);
    const counts =
      ids.length === 0
        ? []
        : await MyGlobal.prisma.community_platform_community_members.groupBy({
            by: ["community_platform_community_id"],
            where: {
              community_platform_community_id: { in: ids },
              deleted_at: null,
            },
            _count: { _all: true },
          });
    const countMap = new Map<string, number>();
    for (const c of counts)
      countMap.set(c.community_platform_community_id, c._count._all);

    return {
      pagination: {
        current: 0,
        limit: Number(limit),
        records: Number(total),
        pages: Number(Math.ceil((total || 0) / (limit || 1))),
      },
      data: ranked.map((r) => ({
        id: r.id as string & tags.Format<"uuid">,
        name: r.name,
        category: r.category as IECommunityCategory,
        description: r.description ?? null,
        logoUrl: r.logo_uri ?? null,
        memberCount: Number(countMap.get(r.id) ?? 0) as number &
          tags.Type<"int32"> &
          tags.Minimum<0>,
        createdAt: toISOStringSafe(r.created_at),
        lastActiveAt: r.last_active_at
          ? toISOStringSafe(r.last_active_at)
          : null,
      })),
    };
  } catch (err) {
    // Surface as generic 500 to clients
    throw new HttpException(
      "A temporary error occurred. Please try again in a moment.",
      500,
    );
  }
}
