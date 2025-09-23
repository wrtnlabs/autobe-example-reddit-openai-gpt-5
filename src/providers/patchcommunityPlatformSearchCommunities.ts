import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";
import { IPageICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformCommunity";

/**
 * Search communities by name with pagination and sorting
 * (community_platform_communities).
 *
 * This endpoint searches community_platform_communities with optional query and
 * category filters. It excludes soft-deleted rows (deleted_at != null). By
 * default, it also excludes administratively disabled communities (disabled_at
 * != null) unless include_disabled is true.
 *
 * Ranking and sorting:
 *
 * - Default (when sort_by not specified and query provided): Name Match ranking
 *   performed in application: exact (name === query) → startsWith(query) → name
 *   contains(query) → description contains(query), with tie-breakers created_at
 *   desc then id desc.
 * - Explicit sorting: sort_by in {"created_at", "last_active_at", "name"} with
 *   sort_dir {"asc", "desc"}.
 *
 * Pagination is 1-based; defaults: page=1, limit=20.
 *
 * @param props - Request properties
 * @param props.body - Search parameters and pagination
 * @returns Paginated community summaries suitable for exploration
 * @throws {HttpException} 400 when query is provided but shorter than 2
 *   characters
 */
export async function patchcommunityPlatformSearchCommunities(props: {
  body: ICommunityPlatformCommunity.IRequest;
}): Promise<IPageICommunityPlatformCommunity.ISummary> {
  const { body } = props;

  // Pagination defaults
  const page = Number(body.page ?? 1);
  const limit = Number(body.limit ?? 20);
  const skip = (page - 1) * limit;

  // Validate query length when provided
  const query = body.query ?? null;
  if (query !== null && query.length < 2) {
    throw new HttpException(
      "Bad Request: query must be at least 2 characters",
      400,
    );
  }

  // Common where condition
  const whereCondition = {
    deleted_at: null,
    ...(body.include_disabled === true ? {} : { disabled_at: null }),
    ...(body.community_platform_category_id !== undefined &&
      body.community_platform_category_id !== null && {
        community_platform_category_id: body.community_platform_category_id,
      }),
    ...(body.category_code !== undefined &&
      body.category_code !== null && {
        category: { code: body.category_code },
      }),
    ...(query !== null && {
      OR: [{ name: { contains: query } }, { description: { contains: query } }],
    }),
  };

  // Helper to map DB rows to API summaries (convert dates, handle optional logo)
  const mapToSummary = (row: {
    id: string;
    name: string;
    community_platform_category_id: string;
    logo: string | null;
    created_at: Date | (string & tags.Format<"date-time">);
    last_active_at: Date | (string & tags.Format<"date-time">);
  }): ICommunityPlatformCommunity.ISummary => {
    return {
      id: row.id as string & tags.Format<"uuid">,
      name: row.name,
      community_platform_category_id:
        row.community_platform_category_id as string & tags.Format<"uuid">,
      logo:
        row.logo === null ? null : (row.logo as string & tags.Format<"uri">),
      created_at: toISOStringSafe(row.created_at),
      last_active_at: toISOStringSafe(row.last_active_at),
    };
  };

  // Sorting behavior
  const sortBy = body.sort_by ?? null;
  const sortDir =
    body.sort_dir === "asc" || body.sort_dir === "desc"
      ? body.sort_dir
      : "desc";

  // Name Match ranking path (default when query provided and no explicit sort_by)
  if (query !== null && (sortBy === null || sortBy === undefined)) {
    const [rows, total] = await Promise.all([
      MyGlobal.prisma.community_platform_communities.findMany({
        where: whereCondition,
        select: {
          id: true,
          name: true,
          community_platform_category_id: true,
          logo: true,
          created_at: true,
          last_active_at: true,
        },
      }),
      MyGlobal.prisma.community_platform_communities.count({
        where: whereCondition,
      }),
    ]);

    const queryLower = query.toLowerCase();
    // Map rows with pre-converted date strings for safe sorting
    const mapped = rows.map((r) => {
      const created = toISOStringSafe(r.created_at);
      const lastActive = toISOStringSafe(r.last_active_at);
      return {
        id: r.id,
        name: r.name,
        community_platform_category_id: r.community_platform_category_id,
        logo: r.logo,
        created_at_str: created,
        last_active_at_str: lastActive,
      };
    });

    // Rank function for Name Match
    const rank = (item: {
      id: string;
      name: string;
      created_at_str: string & tags.Format<"date-time">;
    }): number => {
      const nameLower = item.name.toLowerCase();
      if (nameLower === queryLower) return 0; // exact
      if (nameLower.startsWith(queryLower)) return 1; // prefix
      if (nameLower.includes(queryLower)) return 2; // substring in name
      return 3; // matched via description only
    };

    // Deterministic sort: rank asc, created_at desc, id desc
    mapped.sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;
      const timeCmp = b.created_at_str.localeCompare(a.created_at_str);
      if (timeCmp !== 0) return timeCmp;
      return b.id.localeCompare(a.id);
    });

    const paged = mapped.slice(skip, skip + limit).map((m) =>
      mapToSummary({
        id: m.id,
        name: m.name,
        community_platform_category_id: m.community_platform_category_id,
        logo: m.logo,
        created_at: m.created_at_str,
        last_active_at: m.last_active_at_str,
      }),
    );

    const records = Number(total);
    const pages = Number(Math.ceil(records / limit));

    return {
      pagination: {
        current: Number(page),
        limit: Number(limit),
        records,
        pages,
      },
      data: paged,
    };
  }

  // Explicit sorting path
  const [rows, total] = await Promise.all([
    MyGlobal.prisma.community_platform_communities.findMany({
      where: whereCondition,
      select: {
        id: true,
        name: true,
        community_platform_category_id: true,
        logo: true,
        created_at: true,
        last_active_at: true,
      },
      orderBy:
        sortBy === "created_at"
          ? [{ created_at: sortDir }, { id: "desc" }]
          : sortBy === "last_active_at"
            ? [{ last_active_at: sortDir }, { id: "desc" }]
            : sortBy === "name"
              ? [{ name: sortDir }, { id: "desc" }]
              : [{ created_at: "desc" }, { id: "desc" }],
      skip,
      take: limit,
    }),
    MyGlobal.prisma.community_platform_communities.count({
      where: whereCondition,
    }),
  ]);

  return {
    pagination: {
      current: Number(page),
      limit: Number(limit),
      records: Number(total),
      pages: Number(Math.ceil(Number(total) / limit)),
    },
    data: rows.map(mapToSummary),
  };
}
