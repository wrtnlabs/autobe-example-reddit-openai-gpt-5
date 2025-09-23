import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { CommunitymemberPayload } from "../decorators/payload/CommunitymemberPayload";

/**
 * Remove the current communityMember’s vote on a comment
 * (community_platform_comment_votes)
 *
 * Clears the caller's active vote on the specified comment so their state
 * becomes "None". This is implemented as a soft delete by setting deleted_at
 * (and updated_at) on the existing vote record. If no active vote exists, the
 * operation is idempotent and completes successfully with no changes. The
 * target comment must exist and be active (deleted_at = null).
 *
 * Authorization: only an authenticated, active community member can perform
 * this action. An additional check ensures the underlying user and membership
 * are active and not deleted.
 *
 * @param props - Request properties
 * @param props.communityMember - The authenticated community member payload
 * @param props.commentId - Target comment’s UUID
 * @returns Void on success
 * @throws {HttpException} 403 When the caller is not an active community member
 * @throws {HttpException} 404 When the target comment does not exist or has
 *   been deleted
 */
export async function deletecommunityPlatformCommunityMemberCommentsCommentIdVotes(props: {
  communityMember: CommunitymemberPayload;
  commentId: string & tags.Format<"uuid">;
}): Promise<void> {
  const { communityMember, commentId } = props;

  // Authorization: ensure active community member and active user
  const activeMember =
    await MyGlobal.prisma.community_platform_communitymembers.findFirst({
      where: {
        community_platform_user_id: communityMember.id,
        deleted_at: null,
        status: "active",
        user: {
          is: {
            deleted_at: null,
            status: "active",
          },
        },
      },
      select: { id: true },
    });
  if (activeMember === null) {
    throw new HttpException(
      "Unauthorized: You must be an active community member",
      403,
    );
  }

  // Validate the target comment exists and is not deleted
  const comment = await MyGlobal.prisma.community_platform_comments.findFirst({
    where: { id: commentId, deleted_at: null },
    select: { id: true },
  });
  if (comment === null) {
    throw new HttpException("Not Found", 404);
  }

  // Locate existing vote for (comment, user)
  const vote = await MyGlobal.prisma.community_platform_comment_votes.findFirst(
    {
      where: {
        community_platform_comment_id: commentId,
        community_platform_user_id: communityMember.id,
      },
      select: { id: true, deleted_at: true },
    },
  );

  // If an active vote exists, soft delete it; otherwise, idempotent no-op
  if (vote && vote.deleted_at === null) {
    const now: string & tags.Format<"date-time"> = toISOStringSafe(new Date());
    await MyGlobal.prisma.community_platform_comment_votes.update({
      where: { id: vote.id },
      data: {
        deleted_at: now,
        updated_at: now,
      },
    });
  }
}
