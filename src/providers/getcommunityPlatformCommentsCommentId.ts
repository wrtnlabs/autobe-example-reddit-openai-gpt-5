import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ICommunityPlatformComment } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformComment";

/**
 * Get a single comment from community_platform_comments by ID
 *
 * Fetches one comment identified by the provided commentId. Only returns the
 * comment if it has not been soft-deleted (deleted_at is null). Includes
 * relational context via post and author identifiers. Public read; no auth
 * required.
 *
 * Error handling:
 *
 * - 404 Not Found when the comment does not exist or has been deleted.
 * - 500 Internal Server Error for unexpected database errors.
 *
 * @param props - Request properties
 * @param props.commentId - Identifier of the target comment (UUID)
 * @returns The requested comment entity
 * @throws {HttpException} 404 when not found or soft-deleted
 * @throws {HttpException} 500 on unexpected database errors
 */
export async function getcommunityPlatformCommentsCommentId(props: {
  commentId: string & tags.Format<"uuid">;
}): Promise<ICommunityPlatformComment> {
  try {
    const row =
      await MyGlobal.prisma.community_platform_comments.findFirstOrThrow({
        where: {
          id: props.commentId,
          deleted_at: null,
        },
        select: {
          id: true,
          community_platform_post_id: true,
          community_platform_user_id: true,
          parent_id: true,
          content: true,
          created_at: true,
          updated_at: true,
        },
      });

    const result: ICommunityPlatformComment = {
      id: row.id as string & tags.Format<"uuid">,
      community_platform_post_id: row.community_platform_post_id as string &
        tags.Format<"uuid">,
      community_platform_user_id: row.community_platform_user_id as string &
        tags.Format<"uuid">,
      parent_id:
        row.parent_id === null
          ? null
          : (row.parent_id as string & tags.Format<"uuid">),
      content: row.content,
      created_at: toISOStringSafe(row.created_at),
      updated_at: toISOStringSafe(row.updated_at),
    };

    return result;
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      throw new HttpException("Not Found", 404);
    }
    // For any other error, return a standardized 404 if record absence is implied
    if (err instanceof Prisma.PrismaClientValidationError) {
      // Validation error likely due to malformed input at lower layers
      throw new HttpException("Bad Request", 400);
    }
    throw new HttpException("Internal Server Error", 500);
  }
}
