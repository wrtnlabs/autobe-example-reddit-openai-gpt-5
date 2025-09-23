import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ICommunityPlatformPostSnapshot } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformPostSnapshot";

/**
 * Get a specific post snapshot (community_platform_post_snapshots)
 *
 * Fetches a single historical snapshot for a post by combining the parent
 * postId and the specific historyId (snapshot id). Ensures the snapshot belongs
 * to the given post and excludes soft-deleted snapshots.
 *
 * Public read-only endpoint: no authentication is required. This provider never
 * modifies data.
 *
 * @param props - Request properties containing identifiers
 * @param props.postId - Source post’s ID (UUID)
 * @param props.historyId - Snapshot ID to retrieve (UUID)
 * @returns The snapshot record including foreign keys, content, and timestamps
 * @throws {HttpException} 404 when the snapshot does not exist for the given
 *   post
 */
export async function getcommunityPlatformPostsPostIdHistoryHistoryId(props: {
  postId: string & tags.Format<"uuid">;
  historyId: string & tags.Format<"uuid">;
}): Promise<ICommunityPlatformPostSnapshot> {
  const { postId, historyId } = props;

  const row = await MyGlobal.prisma.community_platform_post_snapshots.findFirst(
    {
      where: {
        id: historyId,
        community_platform_post_id: postId,
        deleted_at: null,
      },
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
    },
  );

  if (!row) {
    throw new HttpException("Not Found", 404);
  }

  return typia.assert<ICommunityPlatformPostSnapshot>({
    id: row.id,
    community_platform_post_id: row.community_platform_post_id,
    editor_user_id: row.editor_user_id ?? undefined,
    title: row.title,
    body: row.body,
    author_display_name: row.author_display_name ?? undefined,
    created_at: toISOStringSafe(row.created_at),
    updated_at: toISOStringSafe(row.updated_at),
    deleted_at: row.deleted_at ? toISOStringSafe(row.deleted_at) : null,
  });
}
