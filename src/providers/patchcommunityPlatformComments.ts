import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ICommunityPlatformComment } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformComment";
import { IPageICommunityPlatformComment } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformComment";

/**
 * Search and paginate comments from community_platform_comments
 *
 * Global search and list for comments with pagination and Newest ordering.
 * Excludes soft-deleted comments and comments whose parent post has been
 * soft-deleted. Supports filters: by post, parent (including top-level only),
 * created_at ranges, and text search on content.
 *
 * Public endpoint: no authentication required.
 *
 * @param props - Request properties
 * @param props.body - Search criteria and pagination parameters
 * @returns Paginated comments matching the search criteria
 * @throws {HttpException} 400 When the query string is shorter than 2
 *   characters
 */
export async function patchcommunityPlatformComments(props: {
  body: ICommunityPlatformComment.IRequest;
}): Promise<IPageICommunityPlatformComment> {
  const { body } = props;

  // Enforce minimum query length if provided
  if (
    body.query !== undefined &&
    body.query !== null &&
    body.query.length < 2
  ) {
    throw new HttpException("Please enter at least 2 characters.", 400);
  }

  // Pagination defaults
  const currentPage = Number(body.page ?? 0);
  const limit = Number(body.limit ?? 20);
  const safeLimit = limit > 0 ? limit : 20;
  const skip = currentPage * safeLimit;

  // Build WHERE condition (exclude deleted comments and comments of deleted posts)
  const whereCondition = {
    deleted_at: null,
    post: {
      deleted_at: null,
    },
    ...(body.post_id !== undefined && {
      community_platform_post_id: body.post_id,
    }),
    // Parent filtering: explicit parent_id takes precedence; otherwise top_level_only => parent_id null
    ...(body.parent_id !== undefined && body.parent_id !== null
      ? { parent_id: body.parent_id }
      : body.top_level_only === true || body.parent_id === null
        ? { parent_id: null }
        : {}),
    // Created_at range
    ...((body.since !== undefined && body.since !== null) ||
    (body.until !== undefined && body.until !== null)
      ? {
          created_at: {
            ...(body.since !== undefined &&
              body.since !== null && { gte: body.since }),
            ...(body.until !== undefined &&
              body.until !== null && { lte: body.until }),
          },
        }
      : {}),
    // Text search on content (contains, cross-engine compatible)
    ...(body.query !== undefined &&
      body.query !== null && {
        content: { contains: body.query },
      }),
  };

  const [rows, total] = await Promise.all([
    MyGlobal.prisma.community_platform_comments.findMany({
      where: whereCondition,
      select: {
        id: true,
        community_platform_post_id: true,
        community_platform_user_id: true,
        parent_id: true,
        content: true,
        created_at: true,
        updated_at: true,
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      skip,
      take: safeLimit,
    }),
    MyGlobal.prisma.community_platform_comments.count({
      where: whereCondition,
    }),
  ]);

  const data: ICommunityPlatformComment[] = rows.map((r) => ({
    id: r.id as string & tags.Format<"uuid">,
    community_platform_post_id: r.community_platform_post_id as string &
      tags.Format<"uuid">,
    community_platform_user_id: r.community_platform_user_id as string &
      tags.Format<"uuid">,
    // Optional AND nullable: include null for top-level, UUID for replies
    parent_id:
      r.parent_id === null
        ? null
        : (r.parent_id as string & tags.Format<"uuid">),
    content: r.content,
    created_at: toISOStringSafe(r.created_at),
    updated_at: toISOStringSafe(r.updated_at),
  }));

  return {
    pagination: {
      current: Number(currentPage),
      limit: Number(safeLimit),
      records: Number(total),
      pages: Number(Math.ceil(total / safeLimit)),
    },
    data,
  };
}
