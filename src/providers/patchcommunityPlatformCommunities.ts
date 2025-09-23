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
 * Search and paginate communities from Prisma table
 * community_platform_communities for public discovery
 *
 * Provides a filtered, paginated list of public communities. Supports search by
 * name/description, category filtering (by category ID or business code),
 * hiding disabled communities by default, and sorting by created_at,
 * last_active_at, or name. Soft-deleted rows (deleted_at != null) are always
 * excluded. This is a public read endpoint with no authentication.
 *
 * @param props - Request properties
 * @param props.body - Filters, sorting, and pagination parameters
 *   (ICommunityPlatformCommunity.IRequest)
 * @returns Paginated list of community summaries optimized for discovery
 * @throws {HttpException} 400 When invalid sort_by or sort_dir is provided
 *   (should be pre-validated by DTO)
 */
export async function patchcommunityPlatformCommunities(props: {
  body: ICommunityPlatformCommunity.IRequest;
}): Promise<IPageICommunityPlatformCommunity.ISummary> {
  const { body } = props;

  // Defaults for pagination and sorting
  const page = body.page ?? 1;
  const limit = body.limit ?? 20;
  const sortBy = body.sort_by ?? "created_at";
  const sortDir = body.sort_dir ?? "desc";

  // Build where condition with strict null/undefined checks for required fields
  const whereCondition = {
    deleted_at: null,
    // Hide disabled communities by default unless explicitly included
    ...(body.include_disabled === true ? {} : { disabled_at: null }),
    // Category ID filter (required field in schema → exclude null explicitly)
    ...(body.community_platform_category_id !== undefined &&
      body.community_platform_category_id !== null && {
        community_platform_category_id: body.community_platform_category_id,
      }),
    // Category business code via relation
    ...(body.category_code !== undefined &&
      body.category_code !== null && {
        category: { code: body.category_code },
      }),
    // Text search on name/description
    ...(body.query !== undefined &&
      body.query !== null && {
        OR: [
          { name: { contains: body.query } },
          { description: { contains: body.query } },
        ],
      }),
  };

  // Determine orderBy inline ensuring stability with id tie-breaker
  const orderBy = (() => {
    if (sortBy === "last_active_at") {
      return [
        { last_active_at: sortDir === "asc" ? "asc" : "desc" },
        { id: "asc" },
      ];
    }
    if (sortBy === "name") {
      return [{ name: sortDir === "asc" ? "asc" : "desc" }, { id: "asc" }];
    }
    // Default: created_at
    return [{ created_at: sortDir === "asc" ? "asc" : "desc" }, { id: "asc" }];
  })();

  const skip = (Number(page) - 1) * Number(limit);
  const take = Number(limit);

  const [rows, total] = await Promise.all([
    MyGlobal.prisma.community_platform_communities.findMany({
      where: whereCondition,
      orderBy,
      skip,
      take,
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

  const data = rows.map((row) => ({
    id: row.id,
    name: row.name,
    community_platform_category_id: row.community_platform_category_id,
    logo: row.logo ?? null,
    created_at: toISOStringSafe(row.created_at),
    last_active_at: toISOStringSafe(row.last_active_at),
  }));

  return {
    pagination: {
      current: Number(page),
      limit: Number(limit),
      records: total,
      pages: Math.ceil(total / Number(limit)),
    },
    data,
  };
}
