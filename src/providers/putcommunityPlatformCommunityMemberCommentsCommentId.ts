import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ICommunityPlatformComment } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformComment";
import { CommunitymemberPayload } from "../decorators/payload/CommunitymemberPayload";

/**
 * Update a comment (community_platform_comments) by ID
 *
 * Edits the mutable fields of an existing comment identified by commentId. Only
 * the original author may update the comment. Logical deletions (deleted_at not
 * null) are treated as not found. Updates the updated_at timestamp on success.
 *
 * Security: Requires authenticated community member. Authorization enforces
 * ownership (author-only edit).
 *
 * @param props - Request properties
 * @param props.communityMember - Authenticated community member payload (author
 *   candidate)
 * @param props.commentId - Target comment UUID to update
 * @param props.body - Partial update payload (currently only content)
 * @returns The updated comment entity
 * @throws {HttpException} 404 When the comment does not exist or is logically
 *   deleted
 * @throws {HttpException} 403 When the requester is not the author
 * @throws {HttpException} 400 When provided content violates length constraints
 */
export async function putcommunityPlatformCommunityMemberCommentsCommentId(props: {
  communityMember: CommunitymemberPayload;
  commentId: string & tags.Format<"uuid">;
  body: ICommunityPlatformComment.IUpdate;
}): Promise<ICommunityPlatformComment> {
  const { communityMember, commentId, body } = props;

  // 1) Load active comment (exclude logically deleted)
  const existing = await MyGlobal.prisma.community_platform_comments.findFirst({
    where: {
      id: commentId,
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

  if (!existing) {
    throw new HttpException("Not Found", 404);
  }

  // 2) Authorization: only author can edit
  if (existing.community_platform_user_id !== communityMember.id) {
    throw new HttpException(
      "You can edit or delete only items you authored.",
      403,
    );
  }

  // 3) Business validation on content (if provided)
  if (body.content !== undefined) {
    const len = body.content.length;
    if (len < 2 || len > 2000) {
      throw new HttpException(
        "Bad Request: Content must be 2–2,000 characters.",
        400,
      );
    }
  }

  // 4) Prepare timestamps
  const now: string & tags.Format<"date-time"> = toISOStringSafe(new Date());

  // 5) Update mutable fields (content) and updated_at
  const updated = await MyGlobal.prisma.community_platform_comments.update({
    where: { id: commentId },
    data: {
      content: body.content ?? undefined,
      updated_at: now,
    },
    select: {
      id: true,
      community_platform_post_id: true,
      community_platform_user_id: true,
      parent_id: true,
      content: true,
      created_at: true,
      // Do not rely on DB-returned updated_at for branding; reuse prepared value
    },
  });

  // 6) Map to DTO with proper date-time formatting
  const result: ICommunityPlatformComment = {
    id: updated.id,
    community_platform_post_id: updated.community_platform_post_id,
    community_platform_user_id: updated.community_platform_user_id,
    parent_id: updated.parent_id ?? null,
    content: updated.content,
    created_at: toISOStringSafe(updated.created_at),
    updated_at: now,
  };

  return result;
}
