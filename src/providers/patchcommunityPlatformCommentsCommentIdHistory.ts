import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ICommunityPlatformCommentSnapshot } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommentSnapshot";
import { IPageICommunityPlatformCommentSnapshot } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformCommentSnapshot";

/**
 * List comment history snapshots (community_platform_comment_snapshots) for a
 * comment
 *
 * Retrieves paginated, filterable, and sortable history snapshots for a
 * specific comment identified by the path parameter. Only active (non-deleted)
 * snapshots are returned. This is a read-only operation and does not modify
 * data.
 *
 * Authorization: Public per spec; enforce higher-level policies elsewhere.
 *
 * @param props - Request properties
 * @param props.commentId - UUID of the target comment whose history is
 *   requested
 * @param props.body - Pagination, sorting, and optional created_at range
 *   filters
 * @returns Paginated collection of snapshot records for the specified comment
 * @throws {HttpException} 404 when the comment does not exist
 */
export async function patchcommunityPlatformCommentsCommentIdHistory(props: {
  commentId: string & tags.Format<"uuid">;
  body: ICommunityPlatformCommentSnapshot.IRequest;
}): Promise<IPageICommunityPlatformCommentSnapshot> {
  const { commentId, body } = props;

  // 1) Ensure the comment exists (404 when not found)
  const comment = await MyGlobal.prisma.community_platform_comments.findUnique({
    where: { id: commentId },
    select: { id: true },
  });
  if (!comment) throw new HttpException("Not Found", 404);

  // 2) Pagination defaults and safety
  const page = body.page ?? (1 as number);
  const limit = body.limit ?? (20 as number);
  const skip = (page - 1) * limit;

  // 3) Ordering defaults
  const orderByField = body.orderBy ?? ("created_at" as "created_at" | "id");
  const direction = body.direction ?? ("desc" as "asc" | "desc");

  // 4) Build reusable where condition for both findMany and count
  const whereCondition = {
    community_platform_comment_id: commentId,
    deleted_at: null,
    ...(body.created_from !== undefined || body.created_to !== undefined
      ? {
          created_at: {
            ...(body.created_from !== undefined && { gte: body.created_from }),
            ...(body.created_to !== undefined && { lte: body.created_to }),
          },
        }
      : {}),
  };

  // 5) Query snapshots and total count concurrently
  const [rows, total] = await Promise.all([
    MyGlobal.prisma.community_platform_comment_snapshots.findMany({
      where: whereCondition,
      select: {
        id: true,
        community_platform_comment_id: true,
        content: true,
        parent_id: true,
        created_at: true,
        updated_at: true,
        deleted_at: true,
      },
      orderBy:
        orderByField === "id" ? { id: direction } : { created_at: direction },
      skip,
      take: limit,
    }),
    MyGlobal.prisma.community_platform_comment_snapshots.count({
      where: whereCondition,
    }),
  ]);

  // 6) Map rows to DTO, converting Date fields safely
  const data = rows.map((r) => ({
    id: r.id as string & tags.Format<"uuid">,
    community_platform_comment_id: r.community_platform_comment_id as string &
      tags.Format<"uuid">,
    content: r.content as string & tags.MinLength<2> & tags.MaxLength<2000>,
    parent_id:
      r.parent_id === null
        ? null
        : (r.parent_id as string & tags.Format<"uuid">),
    created_at: toISOStringSafe(r.created_at),
    updated_at: toISOStringSafe(r.updated_at),
    deleted_at: r.deleted_at ? toISOStringSafe(r.deleted_at) : null,
  }));

  // 7) Compose pagination
  const pages = Math.ceil(total / limit);

  return {
    pagination: {
      current: Number(page),
      limit: Number(limit),
      records: Number(total),
      pages: Number(pages),
    },
    data,
  };
}
