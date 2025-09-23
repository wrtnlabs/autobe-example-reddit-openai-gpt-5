import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { CommunitymemberPayload } from "../decorators/payload/CommunitymemberPayload";

/**
 * Remove a post from active access by setting deleted_at in
 * community_platform_posts.
 *
 * Only the author may perform this operation. This marks the post as deleted
 * (soft delete) so it is excluded from feeds, searches, and materialized views
 * upon refresh.
 *
 * @param props - Request properties
 * @param props.communityMember - The authenticated community member performing
 *   the action
 * @param props.postId - UUID of the post to remove
 * @returns Void
 * @throws {HttpException} 404 When the post does not exist or is already
 *   deleted
 * @throws {HttpException} 403 When the requester is not the author of the post
 */
export async function deletecommunityPlatformCommunityMemberPostsPostId(props: {
  communityMember: CommunitymemberPayload;
  postId: string & tags.Format<"uuid">;
}): Promise<void> {
  const { communityMember, postId } = props;

  // 1) Load post, ensuring it is not already deleted
  const post = await MyGlobal.prisma.community_platform_posts.findFirst({
    where: {
      id: postId,
      deleted_at: null,
    },
    select: {
      id: true,
      author_user_id: true,
      community_platform_community_id: true,
    },
  });

  if (post === null) {
    throw new HttpException("Not Found", 404);
  }

  // 2) Authorization: Only the author can delete their post
  if (post.author_user_id !== communityMember.id) {
    throw new HttpException(
      "You can edit or delete only items you authored.",
      403,
    );
  }

  // 3) Soft delete the post
  const now = toISOStringSafe(new Date());
  await MyGlobal.prisma.community_platform_posts.update({
    where: { id: postId },
    data: {
      deleted_at: now,
      updated_at: now,
    },
  });

  // 4) Best-effort audit log (optional)
  try {
    await MyGlobal.prisma.community_platform_audit_logs.create({
      data: {
        id: v4(),
        actor_user_id: communityMember.id,
        community_id: post.community_platform_community_id,
        post_id: postId,
        event_type: "post_deleted",
        success: true,
        created_at: now,
        updated_at: now,
      },
    });
  } catch {
    // Ignore audit logging failures to avoid impacting the main operation
  }
}
