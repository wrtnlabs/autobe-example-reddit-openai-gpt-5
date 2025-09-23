import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ICommunityPlatformReservedTerm } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformReservedTerm";
import { IPageICommunityPlatformReservedTerm } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformReservedTerm";

export async function patchcommunityPlatformReservedTerms(props: {
  body: ICommunityPlatformReservedTerm.IRequest;
}): Promise<IPageICommunityPlatformReservedTerm.ISummary> {
  /**
   * Search and paginate reserved terms (community_platform_reserved_terms)
   *
   * Retrieves a filtered, sorted, and paginated list of reserved terms for
   * administrative or validation purposes. Excludes soft-deleted records
   * (deleted_at != null). Supports free-text search against term and
   * term_normalized (case-insensitive via normalized field), filtering by
   * applies_to and active, and sorting by created_at (default), term, or
   * applies_to.
   *
   * @param props - Request with search, filter, sort, and pagination options
   * @returns Paginated collection of reserved term summaries
   * @throws {HttpException} 500 when database operation fails unexpectedly
   */
  const { body } = props;

  const pageRaw = body.page ?? 1;
  const limitRaw = body.limit ?? 20;
  const page = Number(pageRaw);
  const limit = Number(limitRaw);
  const skip = (page - 1) * limit;

  // Build where condition with soft-delete exclusion and optional filters
  const whereCondition = {
    deleted_at: null,
    ...(body.applies_to !== undefined &&
      body.applies_to !== null && {
        applies_to: body.applies_to,
      }),
    ...(body.active !== undefined &&
      body.active !== null && {
        active: body.active,
      }),
    ...(() => {
      if (body.query === undefined || body.query === null) return {};
      const qLower = body.query.toLowerCase();
      return {
        OR: [
          { term: { contains: body.query } },
          { term_normalized: { contains: qLower } },
        ],
      };
    })(),
  };

  const sortBy = body.sort_by ?? "created_at";
  const sortDir = body.sort_dir ?? "desc";

  try {
    const [rows, total] = await Promise.all([
      MyGlobal.prisma.community_platform_reserved_terms.findMany({
        where: whereCondition,
        orderBy:
          sortBy === "term"
            ? { term: sortDir }
            : sortBy === "applies_to"
              ? { applies_to: sortDir }
              : { created_at: sortDir },
        skip,
        take: limit,
        select: {
          id: true,
          term: true,
          applies_to: true,
          active: true,
          created_at: true,
        },
      }),
      MyGlobal.prisma.community_platform_reserved_terms.count({
        where: whereCondition,
      }),
    ]);

    const data = rows.map((r) => ({
      id: r.id as string & tags.Format<"uuid">,
      term: r.term,
      applies_to: r.applies_to,
      active: r.active,
      created_at: toISOStringSafe(r.created_at),
    }));

    const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;

    return {
      pagination: {
        current: Number(page),
        limit: Number(limit),
        records: Number(total),
        pages: Number(totalPages),
      },
      data,
    };
  } catch (err) {
    // Surface a controlled error; upstream can log details.
    throw new HttpException("Internal Server Error", 500);
  }
}
