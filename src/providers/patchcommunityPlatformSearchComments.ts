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
 * Search comments (community_platform_comments) with Newest ordering and
 * paginated results.
 *
 * Retrieves public, non-deleted comments matching a free-text query with
 * deterministic Newest ordering (created_at DESC, id DESC) and stable
 * pagination. Excludes comments whose parent post is deleted or whose community
 * is disabled/deleted. Supports optional filters for post scope, parent
 * replies, top-level only, and created_at ranges.
 *
 * Validation: query must be at least 2 characters; shorter inputs return a 400
 * error with guidance. Default pagination: page=0, limit=20.
 *
 * @param props - Request properties
 * @param props.body - ICommunityPlatformComment.IRequest containing search
 *   query and filters
 * @returns Paginated collection of comment summaries ordered by Newest
 * @throws {HttpException} 400 when query is missing or shorter than 2
 *   characters
 */
export async function patchcommunityPlatformSearchComments(props: {
  body: ICommunityPlatformComment.IRequest;
}): Promise<IPageICommunityPlatformComment.ISummary> {
  const { body } = props;

  // Validate query presence and minimum length (>= 2)
  const rawQuery = body.query ?? "";
  const trimmed = rawQuery.trim();
  if (trimmed.length < 2) {
    throw new HttpException("Please enter at least 2 characters.", 400);
  }

  // Pagination defaults
  const pageNumber = Number(body.page ?? 0);
  const limitNumber = Number(body.limit ?? 20);
  const skip = pageNumber * limitNumber;

  // Build where condition (comments visibility + filters)
  const whereCondition = {
    // Only active (non-deleted) comments
    deleted_at: null,

    // Text search against content (trigram-backed via index)
    content: { contains: trimmed },

    // Optional: scope to a specific post
    ...(body.post_id !== undefined && {
      community_platform_post_id: body.post_id,
    }),

    // Parent logic: parent_id filter takes precedence; otherwise top-level-only
    ...(() => {
      if (body.parent_id !== undefined && body.parent_id !== null) {
        return { parent_id: body.parent_id };
      }
      if (body.top_level_only === true && body.parent_id === undefined) {
        return { parent_id: null };
      }
      return {};
    })(),

    // Created_at range filters
    ...(body.since !== undefined || body.until !== undefined
      ? {
          created_at: {
            ...(body.since !== undefined && { gte: body.since }),
            ...(body.until !== undefined && { lte: body.until }),
          },
        }
      : {}),

    // Visibility of related post and community
    post: {
      is: {
        deleted_at: null,
        community: {
          is: {
            disabled_at: null,
            deleted_at: null,
          },
        },
      },
    },
  };

  // Execute in parallel for consistency and performance
  const [rows, total] = await Promise.all([
    MyGlobal.prisma.community_platform_comments.findMany({
      where: whereCondition,
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      skip: skip,
      take: limitNumber,
      select: {
        id: true,
        community_platform_post_id: true,
        community_platform_user_id: true,
        parent_id: true,
        content: true,
        created_at: true,
        updated_at: true,
      },
    }),
    MyGlobal.prisma.community_platform_comments.count({
      where: whereCondition,
    }),
  ]);

  const data = rows.map((r) => ({
    id: r.id,
    community_platform_post_id: r.community_platform_post_id,
    community_platform_user_id: r.community_platform_user_id,
    parent_id: r.parent_id ?? null,
    content: r.content,
    created_at: toISOStringSafe(r.created_at),
    updated_at: toISOStringSafe(r.updated_at),
  }));

  const pagination = {
    current: Number(pageNumber),
    limit: Number(limitNumber),
    records: Number(total),
    pages: Math.ceil((total || 0) / (limitNumber || 1)),
  };

  return typia.assert<IPageICommunityPlatformComment.ISummary>({
    pagination,
    data,
  });
}
