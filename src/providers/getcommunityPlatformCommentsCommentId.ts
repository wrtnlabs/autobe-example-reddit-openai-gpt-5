import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ICommunityPlatformComment } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformComment";
import { IECommunityPlatformVoteState } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformVoteState";
import { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

export async function getCommunityPlatformCommentsCommentId(props: {
  commentId: string & tags.Format<"uuid">;
}): Promise<ICommunityPlatformComment> {
  /**
   * Get one comment (community_platform_comments) by ID
   *
   * Publicly retrieves a single comment by its identifier. Returns the resource
   * even when soft-deleted (deletedAt set) so clients can render placeholders
   * while preserving thread position.
   *
   * @param props - Request properties
   * @param props.commentId - UUID of the target comment
   * @returns The comment with identifiers, content, timestamps, and optional
   *   author summary
   * @throws {HttpException} 404 when the comment does not exist
   */
  const { commentId } = props;

  const row = await MyGlobal.prisma.community_platform_comments.findUnique({
    where: { id: commentId },
    select: {
      id: true,
      community_platform_post_id: true,
      community_platform_user_id: true,
      parent_id: true,
      content: true,
      created_at: true,
      updated_at: true,
      deleted_at: true,
    },
  });

  if (!row) {
    throw new HttpException("Comment not found", 404);
  }

  const author = await MyGlobal.prisma.community_platform_users.findUnique({
    where: { id: row.community_platform_user_id },
    select: {
      id: true,
      username: true,
      email: true,
      display_name: true,
      last_login_at: true,
      created_at: true,
      updated_at: true,
    },
  });

  return {
    id: row.id as string & tags.Format<"uuid">,
    postId: row.community_platform_post_id as string & tags.Format<"uuid">,
    authorId: row.community_platform_user_id as string & tags.Format<"uuid">,
    parentId:
      row.parent_id === null
        ? null
        : (row.parent_id as string & tags.Format<"uuid">),
    content: row.content,
    createdAt: toISOStringSafe(row.created_at),
    updatedAt: toISOStringSafe(row.updated_at),
    deletedAt: row.deleted_at ? toISOStringSafe(row.deleted_at) : null,
    author: author
      ? {
          id: author.id as string & tags.Format<"uuid">,
          username: author.username,
          email: author.email,
          display_name: author.display_name ?? null,
          last_login_at: author.last_login_at
            ? toISOStringSafe(author.last_login_at)
            : null,
          created_at: toISOStringSafe(author.created_at),
          updated_at: toISOStringSafe(author.updated_at),
        }
      : undefined,
  };
}
