import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ICommunityPlatformCommentSnapshot } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommentSnapshot";

/**
 * Get a specific comment snapshot (community_platform_comment_snapshots) by
 * historyId
 *
 * Retrieves a single historical snapshot belonging to the specified comment.
 * The snapshot is immutable and includes the captured content, parent_id at
 * that time, and timestamps. Records with non-null deleted_at are excluded.
 *
 * @param props - Request properties
 * @param props.commentId - UUID of the comment that owns the snapshot
 * @param props.historyId - UUID of the snapshot to retrieve
 * @returns The snapshot record with content and timestamps
 * @throws {HttpException} 404 when snapshot does not exist or does not belong
 *   to the comment
 */
export async function getcommunityPlatformCommentsCommentIdHistoryHistoryId(props: {
  commentId: string & tags.Format<"uuid">;
  historyId: string & tags.Format<"uuid">;
}): Promise<ICommunityPlatformCommentSnapshot> {
  const { commentId, historyId } = props;

  const snapshot =
    await MyGlobal.prisma.community_platform_comment_snapshots.findFirst({
      where: {
        id: historyId,
        community_platform_comment_id: commentId,
        deleted_at: null,
      },
      select: {
        id: true,
        community_platform_comment_id: true,
        content: true,
        parent_id: true,
        created_at: true,
        updated_at: true,
        deleted_at: true,
      },
    });

  if (!snapshot) {
    throw new HttpException("Not Found", 404);
  }

  return {
    id: snapshot.id as string & tags.Format<"uuid">,
    community_platform_comment_id:
      snapshot.community_platform_comment_id as string & tags.Format<"uuid">,
    content: snapshot.content as string &
      tags.MinLength<2> &
      tags.MaxLength<2000>,
    parent_id:
      snapshot.parent_id === null
        ? undefined
        : (snapshot.parent_id as string & tags.Format<"uuid">),
    created_at: toISOStringSafe(snapshot.created_at),
    updated_at: toISOStringSafe(snapshot.updated_at),
    deleted_at: null,
  };
}
