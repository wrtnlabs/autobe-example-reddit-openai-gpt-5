import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { CommunitymemberPayload } from "../decorators/payload/CommunitymemberPayload";

/**
 * Remove the current user’s active vote from community_platform_post_votes.
 *
 * Clears the authenticated community member's vote on the specified post so the
 * effective state becomes "None". Implements soft delete by setting deleted_at
 * (and updated_at) when an active vote exists. If no active vote is present,
 * the operation is idempotent and succeeds without changes.
 *
 * Security: Only the authenticated community member can clear their own vote.
 * Attempting to clear a vote on a non-existent (or soft-deleted) post yields
 * 404.
 *
 * @param props - Request properties
 * @param props.communityMember - Authenticated community member payload (actor)
 * @param props.postId - Target post UUID whose vote will be cleared
 * @returns Void (no content)
 * @throws {HttpException} 404 when the post does not exist or is soft-deleted
 */
export async function deletecommunityPlatformCommunityMemberPostsPostIdVotes(props: {
  communityMember: CommunitymemberPayload;
  postId: string & tags.Format<"uuid">;
}): Promise<void> {
  const { communityMember, postId } = props;

  // 1) Ensure post exists and is not soft-deleted
  const post = await MyGlobal.prisma.community_platform_posts.findFirst({
    where: {
      id: postId,
      deleted_at: null,
    },
    select: { id: true },
  });
  if (!post) throw new HttpException("Not Found", 404);

  // 2) Find active vote (idempotent if none)
  const vote = await MyGlobal.prisma.community_platform_post_votes.findFirst({
    where: {
      community_platform_post_id: postId,
      community_platform_user_id: communityMember.id,
      deleted_at: null,
    },
    select: { id: true },
  });
  if (!vote) return; // Nothing to clear

  // 3) Soft delete the vote
  const now: string & tags.Format<"date-time"> = toISOStringSafe(new Date());
  await MyGlobal.prisma.community_platform_post_votes.update({
    where: { id: vote.id },
    data: {
      deleted_at: now,
      updated_at: now,
    },
  });

  return;
}
