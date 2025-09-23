import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ICommunityPlatformPostSnapshot } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformPostSnapshot";
import { IPageICommunityPlatformPostSnapshot } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformPostSnapshot";

/**
 * List post snapshots from community_platform_post_snapshots for a post
 *
 * Retrieves a paginated, filterable list of historical snapshots for the given
 * postId. Supports pagination, optional created_at range filtering, and sorting
 * with deterministic tie-breakers. This is a read-only endpoint; no creation or
 * updates occur.
 *
 * Authorization: Public read (upstream may impose additional visibility rules).
 *
 * @param props - Request properties
 * @param props.postId - Source post’s ID (UUID)
 * @param props.body - Pagination, sorting, and optional created_at range
 *   filters
 * @returns Paginated list of snapshots for the specified post
 * @throws {HttpException} 404 when the post does not exist
 */
export async function patchcommunityPlatformPostsPostIdHistory(props: {
  postId: string & tags.Format<"uuid">;
  body: ICommunityPlatformPostSnapshot.IRequest;
}): Promise<IPageICommunityPlatformPostSnapshot> {
  const { postId, body } = props;

  // Ensure the post exists; treat absence as 404
  const post = await MyGlobal.prisma.community_platform_posts.findUnique({
    where: { id: postId },
    select: { id: true },
  });
  if (!post) {
    throw new HttpException("Not Found", 404);
  }

  // Pagination defaults and normalization
  const page = Number(body.page ?? 1);
  const limit = Number(body.limit ?? 20);
  const skip = (page - 1) * limit;

  // Build where condition (reuse across queries)
  const from = body.created_from;
  const to = body.created_to;
  const whereCondition = {
    community_platform_post_id: postId,
    deleted_at: null as null,
    ...(from !== undefined || to !== undefined
      ? {
          created_at: {
            ...(from !== undefined ? { gte: toISOStringSafe(from) } : {}),
            ...(to !== undefined ? { lte: toISOStringSafe(to) } : {}),
          },
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    MyGlobal.prisma.community_platform_post_snapshots.findMany({
      where: whereCondition,
      select: {
        id: true,
        community_platform_post_id: true,
        editor_user_id: true,
        title: true,
        body: true,
        author_display_name: true,
        created_at: true,
        updated_at: true,
        deleted_at: true,
      },
      orderBy: (() => {
        const dir = body.direction ?? "desc";
        switch (body.orderBy ?? "created_at") {
          case "id":
            return [
              { id: dir },
              { created_at: "desc" as const },
              { id: "desc" as const },
            ];
          case "title":
            return [
              { title: dir },
              { created_at: "desc" as const },
              { id: "desc" as const },
            ];
          default:
            return [{ created_at: dir }, { id: dir }];
        }
      })(),
      skip,
      take: limit,
    }),
    MyGlobal.prisma.community_platform_post_snapshots.count({
      where: whereCondition,
    }),
  ]);

  const data = rows.map((r) => ({
    id: r.id as string & tags.Format<"uuid">,
    community_platform_post_id: r.community_platform_post_id as string &
      tags.Format<"uuid">,
    editor_user_id:
      r.editor_user_id === null
        ? null
        : (r.editor_user_id as string & tags.Format<"uuid">),
    title: r.title as string & tags.MinLength<5> & tags.MaxLength<120>,
    body: r.body as string & tags.MinLength<10> & tags.MaxLength<10000>,
    author_display_name:
      r.author_display_name === null
        ? null
        : (r.author_display_name as string & tags.MaxLength<32>),
    created_at: toISOStringSafe(r.created_at),
    updated_at: toISOStringSafe(r.updated_at),
    deleted_at: r.deleted_at ? toISOStringSafe(r.deleted_at) : null,
  }));

  return {
    pagination: {
      current: Number(page),
      limit: Number(limit),
      records: Number(total),
      pages: Number(limit) > 0 ? Math.ceil(Number(total) / Number(limit)) : 0,
    },
    data,
  };
}
