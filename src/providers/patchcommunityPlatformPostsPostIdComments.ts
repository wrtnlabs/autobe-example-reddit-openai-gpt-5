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
 * List/search comments for a post from community_platform_comments
 *
 * Retrieves a paginated list of non-deleted comments for the specified post.
 * Supports filtering by top-level comments or replies of a specific parent,
 * free-text search, date range filters, and canonical Newest ordering
 * (created_at desc; tie-break by id desc).
 *
 * Security: Public read; no authentication required. Soft-deleted comments are
 * excluded.
 *
 * @param props - Request properties
 * @param props.postId - Target post’s UUID to list comments for
 * @param props.body - Search and pagination parameters (parent/top-level
 *   filter, search, range, sort, pagination)
 * @returns Paginated list of comments under the given post
 * @throws {HttpException} 400 When validation fails (invalid sort, paging, or
 *   cross-post parent)
 * @throws {HttpException} 404 When the post does not exist
 */
export async function patchcommunityPlatformPostsPostIdComments(props: {
  postId: string & tags.Format<"uuid">;
  body: ICommunityPlatformComment.IRequest;
}): Promise<IPageICommunityPlatformComment> {
  const { postId, body } = props;

  // Validate sort option (only "Newest" is allowed)
  if (body.sort !== undefined && body.sort !== "Newest") {
    throw new HttpException("Bad Request: Unsupported sort option", 400);
  }

  // Pagination defaults and validation
  const page = Number(body.page ?? 0);
  const limit = Number(body.limit ?? 20);
  if (!Number.isFinite(page) || page < 0) {
    throw new HttpException(
      "Bad Request: page must be a non-negative integer",
      400,
    );
  }
  if (!Number.isFinite(limit) || limit < 1) {
    throw new HttpException(
      "Bad Request: limit must be a positive integer",
      400,
    );
  }

  // Ensure target post exists
  const post = await MyGlobal.prisma.community_platform_posts.findUnique({
    where: { id: postId },
    select: { id: true },
  });
  if (!post) {
    throw new HttpException("Not Found: post does not exist", 404);
  }

  // If parent_id specified (non-null), ensure it belongs to the same post
  if (body.parent_id !== undefined && body.parent_id !== null) {
    const parent = await MyGlobal.prisma.community_platform_comments.findFirst({
      where: {
        id: body.parent_id,
        community_platform_post_id: postId,
      },
      select: { id: true },
    });
    if (!parent) {
      throw new HttpException(
        "Bad Request: parent_id does not belong to the specified post or does not exist",
        400,
      );
    }
  }

  // Build where condition
  const whereCondition = {
    community_platform_post_id: postId,
    deleted_at: null,
    // Parent filters: explicit parent_id takes precedence
    ...(body.parent_id !== undefined
      ? body.parent_id === null
        ? { parent_id: null }
        : { parent_id: body.parent_id }
      : body.top_level_only === true
        ? { parent_id: null }
        : {}),
    // Full-text (simple) search on content
    ...(typeof body.query === "string" && body.query.length >= 2
      ? { content: { contains: body.query } }
      : {}),
    // Date range filters
    ...((body.since !== undefined && body.since !== null) ||
    (body.until !== undefined && body.until !== null)
      ? {
          created_at: {
            ...(body.since !== undefined && body.since !== null
              ? { gte: body.since }
              : {}),
            ...(body.until !== undefined && body.until !== null
              ? { lte: body.until }
              : {}),
          },
        }
      : {}),
  };

  // Execute list and count in parallel using the same where condition
  const [rows, total] = await Promise.all([
    MyGlobal.prisma.community_platform_comments.findMany({
      where: whereCondition,
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      skip: page * limit,
      take: limit,
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

  // Map to DTO with proper date conversions
  const data: ICommunityPlatformComment[] = rows.map((r) => ({
    id: r.id as string & tags.Format<"uuid">,
    community_platform_post_id: r.community_platform_post_id as string &
      tags.Format<"uuid">,
    community_platform_user_id: r.community_platform_user_id as string &
      tags.Format<"uuid">,
    parent_id:
      r.parent_id === null
        ? null
        : (r.parent_id as string & tags.Format<"uuid">),
    content: r.content,
    created_at: toISOStringSafe(r.created_at),
    updated_at: toISOStringSafe(r.updated_at),
  }));

  const records = Number(total);
  const current = Number(page);
  const size = Number(limit);
  const pages = size > 0 ? Number(Math.ceil(records / size)) : 0;

  return {
    pagination: {
      current,
      limit: size,
      records,
      pages,
    },
    data,
  };
}
