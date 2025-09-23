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
 * List replies (community_platform_comments) under a parent comment with
 * pagination.
 *
 * Retrieves direct child comments whose parent_id equals the given commentId.
 * Only active (deleted_at is null) replies are returned. Supports pagination
 * and Newest ordering (created_at desc, tie-break by id desc). The operation is
 * public and performs a parent existence check.
 *
 * @param props - Request properties
 * @param props.commentId - Parent comment's UUID
 * @param props.body - Listing parameters (page, limit, query, since, until,
 *   etc.)
 * @returns Paginated collection of reply comments
 * @throws {HttpException} 404 when the parent comment does not exist or is
 *   deleted
 */
export async function patchcommunityPlatformCommentsCommentIdReplies(props: {
  commentId: string & tags.Format<"uuid">;
  body: ICommunityPlatformComment.IRequest;
}): Promise<IPageICommunityPlatformComment> {
  const { commentId, body } = props;

  // 1) Ensure parent comment exists and is active
  const parent = await MyGlobal.prisma.community_platform_comments.findFirst({
    where: {
      id: commentId,
      deleted_at: null,
    },
    select: { id: true },
  });
  if (!parent) {
    throw new HttpException(
      "Not Found: Parent comment does not exist or was removed",
      404,
    );
  }

  // Pagination defaults
  const page = (body.page ?? 0) as number;
  const limit = (body.limit ?? 20) as number;
  const skip = Number(page) * Number(limit);

  // Optional filters
  const hasQuery = typeof body.query === "string" && body.query.length >= 2;
  const hasSince = body.since !== undefined && body.since !== null;
  const hasUntil = body.until !== undefined && body.until !== null;

  // Build where condition enforcing scope to parentId and active children
  const where = {
    parent_id: commentId,
    deleted_at: null,
    ...(body.post_id !== undefined && {
      community_platform_post_id: body.post_id,
    }),
    ...(hasQuery && {
      content: {
        contains: body.query!,
      },
    }),
    ...(hasSince || hasUntil
      ? {
          created_at: {
            ...(hasSince && { gte: toISOStringSafe(body.since!) }),
            ...(hasUntil && { lte: toISOStringSafe(body.until!) }),
          },
        }
      : {}),
  };

  // Order: Newest (created_at desc, id desc)
  const orderBy = [{ created_at: "desc" as const }, { id: "desc" as const }];

  // Fetch page and total concurrently
  const [rows, total] = await Promise.all([
    MyGlobal.prisma.community_platform_comments.findMany({
      where,
      orderBy,
      skip,
      take: Number(limit),
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
    MyGlobal.prisma.community_platform_comments.count({ where }),
  ]);

  // Map to DTO with proper date conversions and brands
  const data = rows.map((r) => ({
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

  return {
    pagination: {
      current: Number(page),
      limit: Number(limit),
      records: Number(total),
      pages: Number(Math.ceil(total / Number(limit))),
    },
    data,
  };
}
