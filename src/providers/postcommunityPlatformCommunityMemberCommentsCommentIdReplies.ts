import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ICommunityPlatformComment } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformComment";
import { CommunitymemberPayload } from "../decorators/payload/CommunitymemberPayload";

export async function postcommunityPlatformCommunityMemberCommentsCommentIdReplies(props: {
  communityMember: CommunitymemberPayload;
  commentId: string & tags.Format<"uuid">;
  body: ICommunityPlatformComment.ICreate;
}): Promise<ICommunityPlatformComment> {
  /**
   * Create a reply comment (community_platform_comments) under a parent
   * comment.
   *
   * Inserts a new child comment that:
   *
   * - References the same post as the parent (community_platform_post_id)
   * - Sets parent_id to the provided path parameter (commentId)
   * - Attributes authorship to the authenticated community member
   * - Validates that the parent exists and is not soft-deleted
   * - Enforces content length constraints (2–2,000 characters)
   *
   * @param props - Request properties
   * @param props.communityMember - Authenticated community member payload
   *   (author)
   * @param props.commentId - UUID of the parent comment to reply to
   * @param props.body - Reply creation payload (content, optional parent_id)
   * @returns Newly created comment entity
   * @throws {HttpException} 401 when unauthenticated
   * @throws {HttpException} 400 when validation fails (content length,
   *   parent_id mismatch)
   * @throws {HttpException} 404 when parent comment not found or removed
   */
  const { communityMember, commentId, body } = props;

  // Authorization: must have authenticated community member
  if (!communityMember || !communityMember.id) {
    throw new HttpException("Unauthorized", 401);
  }

  // Validate parent comment existence and not soft-deleted
  const parent = await MyGlobal.prisma.community_platform_comments.findUnique({
    where: { id: commentId },
    select: {
      id: true,
      community_platform_post_id: true,
      deleted_at: true,
    },
  });
  if (!parent || parent.deleted_at !== null) {
    throw new HttpException("Parent comment not found", 404);
  }

  // Enforce body.parent_id (if provided) must equal path commentId
  if (
    body.parent_id !== undefined &&
    body.parent_id !== null &&
    body.parent_id !== commentId
  ) {
    throw new HttpException(
      "Bad Request: parent_id must match path commentId",
      400,
    );
  }

  // Validate content length per business rule (2–2,000)
  const content = body.content;
  const length = content.length;
  if (length < 2 || length > 2000) {
    throw new HttpException(
      "Bad Request: content length must be between 2 and 2000 characters",
      400,
    );
  }

  // Prepare identifiers and timestamps
  const id = v4() as string & tags.Format<"uuid">;
  const now = toISOStringSafe(new Date());
  const postId = parent.community_platform_post_id as string &
    tags.Format<"uuid">;
  const authorUserId = communityMember.id as string & tags.Format<"uuid">;

  // Create the reply comment
  await MyGlobal.prisma.community_platform_comments.create({
    data: {
      id,
      community_platform_post_id: postId,
      community_platform_user_id: authorUserId,
      parent_id: commentId,
      content,
      created_at: now,
      updated_at: now,
      // deleted_at omitted → defaults to NULL
    },
  });

  // Return API entity (use prepared values to preserve branding and avoid re-reading nullable dates)
  const result: ICommunityPlatformComment = {
    id,
    community_platform_post_id: postId,
    community_platform_user_id: authorUserId,
    parent_id: commentId,
    content,
    created_at: now,
    updated_at: now,
  };
  return result;
}
