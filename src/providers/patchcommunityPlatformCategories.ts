import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ICommunityPlatformCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCategory";
import { IPageICommunityPlatformCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformCategory";

/**
 * Search and paginate categories from Prisma table
 * community_platform_categories.
 *
 * Public discovery endpoint: filters by active flag, free-text search over
 * code/name, and sorting by display_order/name/code/created_at. Soft-deleted
 * rows (deleted_at != null) are excluded. Returns a paginated list of category
 * summaries for list views.
 *
 * Validation:
 *
 * - Page must be >= 1 when provided
 * - Limit must be >= 1 when provided; values > 1000 are clamped to 1000
 * - SortBy must be one of: "display_order" | "name" | "code" | "created_at"
 * - Direction must be either "asc" or "desc" when provided
 *
 * Deterministic ordering: primary sort as requested, then created_at asc, then
 * id asc.
 *
 * @param props - Request properties
 * @param props.body - Search, filter, sort, and pagination parameters
 *   (ICommunityPlatformCategory.IRequest)
 * @returns Paginated page containing category summaries suitable for list
 *   rendering
 * @throws {HttpException} 400 when pagination or sort inputs are invalid
 */
export async function patchcommunityPlatformCategories(props: {
  body: ICommunityPlatformCategory.IRequest;
}): Promise<IPageICommunityPlatformCategory.ISummary> {
  const body = props.body ?? ({} as ICommunityPlatformCategory.IRequest);

  // Defaults
  const rawPage = body.page ?? 1;
  const rawLimit = body.limit ?? 20;
  const sortBy = body.sortBy ?? "display_order";
  const direction = body.direction ?? "asc";

  // Runtime validations per DTO constraints
  if (rawPage < 1) {
    throw new HttpException("Bad Request: page must be >= 1", 400);
  }
  if (rawLimit < 1) {
    throw new HttpException("Bad Request: limit must be >= 1", 400);
  }
  // Clamp to DTO maximum 1000
  const limit = rawLimit > 1000 ? 1000 : rawLimit;

  const allowedSorts: ReadonlyArray<
    "display_order" | "name" | "code" | "created_at"
  > = ["display_order", "name", "code", "created_at"];
  if (
    sortBy !== undefined &&
    sortBy !== null &&
    !allowedSorts.includes(sortBy)
  ) {
    throw new HttpException("Bad Request: invalid sortBy", 400);
  }
  if (
    direction !== undefined &&
    direction !== null &&
    direction !== "asc" &&
    direction !== "desc"
  ) {
    throw new HttpException(
      "Bad Request: invalid direction (must be 'asc' or 'desc')",
      400,
    );
  }

  const page = rawPage;
  const skip = (page - 1) * limit;

  // Build where condition (allowed extraction for readability)
  const whereCondition = {
    deleted_at: null,
    ...(body.active !== undefined &&
      body.active !== null && { active: body.active }),
    ...(() => {
      const s = body.search;
      if (s === undefined || s === null || s.length === 0) return {};
      return {
        OR: [{ code: { contains: s } }, { name: { contains: s } }],
      } as const;
    })(),
  } as const;

  // Fetch data and total count concurrently
  const [rows, total] = await Promise.all([
    MyGlobal.prisma.community_platform_categories.findMany({
      where: whereCondition,
      select: {
        id: true,
        code: true,
        name: true,
        display_order: true,
        active: true,
        created_at: true,
      },
      orderBy: [
        sortBy === "display_order"
          ? { display_order: direction }
          : sortBy === "name"
            ? { name: direction }
            : sortBy === "code"
              ? { code: direction }
              : { created_at: direction },
        { created_at: "asc" },
        { id: "asc" },
      ],
      skip,
      take: limit,
    }),
    MyGlobal.prisma.community_platform_categories.count({
      where: whereCondition,
    }),
  ]);

  // Map to summaries with proper brand conversions without using 'as'
  const data: ICommunityPlatformCategory.ISummary[] = rows.map((r) => ({
    id: typia.assert<string & tags.Format<"uuid">>(r.id),
    code: r.code,
    name: r.name,
    display_order: typia.assert<number & tags.Type<"int32">>(r.display_order),
    active: r.active,
    created_at: toISOStringSafe(r.created_at),
  }));

  const pages = limit === 0 ? 0 : Math.ceil(total / limit);

  return {
    pagination: {
      current: typia.assert<number & tags.Type<"int32"> & tags.Minimum<0>>(
        Number(page),
      ),
      limit: typia.assert<number & tags.Type<"int32"> & tags.Minimum<0>>(
        Number(limit),
      ),
      records: typia.assert<number & tags.Type<"int32"> & tags.Minimum<0>>(
        Number(total),
      ),
      pages: typia.assert<number & tags.Type<"int32"> & tags.Minimum<0>>(
        Number(pages),
      ),
    },
    data,
  };
}
