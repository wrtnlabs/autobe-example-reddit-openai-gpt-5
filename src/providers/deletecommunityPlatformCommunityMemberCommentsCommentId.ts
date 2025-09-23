import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { CommunitymemberPayload } from "../decorators/payload/CommunitymemberPayload";

/**
 * Delete a comment (community_platform_comments) by ID by setting deleted_at.
 *
 * Performs a soft delete by marking the target comment's deleted_at timestamp,
 * ensuring the record exists, is not already removed, and that the actor is the
 * original author. Also updates updated_at. Returns no content on success.
 *
 * Security: Only the comment author (community member) can delete their own
 * comment. Administrative removals are handled elsewhere.
 *
 * @param props - Request properties
 * @param props.communityMember - Authenticated community member payload (actor)
 * @param props.commentId - Target comment UUID to delete
 * @returns Resolves with no value on success
 * @throws {HttpException} 404 when the comment does not exist or is already
 *   removed
 * @throws {HttpException} 403 when the actor is not the author of the comment
 */
export async function deletecommunityPlatformCommunityMemberCommentsCommentId(props: {
  communityMember: CommunitymemberPayload;
  commentId: string & tags.Format<"uuid">;
}): Promise<void> {
  const { communityMember, commentId } = props;

  // 1) Ensure the comment exists and is not already removed
  const comment = await MyGlobal.prisma.community_platform_comments.findFirst({
    where: { id: commentId, deleted_at: null },
    select: { id: true, community_platform_user_id: true },
  });
  if (!comment) {
    throw new HttpException("Not Found", 404);
  }

  // 2) Authorization: only author can delete their own comment
  if (comment.community_platform_user_id !== communityMember.id) {
    throw new HttpException(
      "You can edit or delete only items you authored.",
      403,
    );
  }

  // 3) Soft delete by setting deleted_at and updating updated_at
  const now = toISOStringSafe(new Date());
  await MyGlobal.prisma.community_platform_comments.update({
    where: { id: commentId },
    data: {
      deleted_at: now,
      updated_at: now,
    },
  });

  // 4) No response body (void)
  return;
}
