import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { RegisteredmemberPayload } from "../decorators/payload/RegisteredmemberPayload";

export async function deleteCommunityPlatformRegisteredMemberCommentsCommentIdVote(props: {
  registeredMember: RegisteredmemberPayload;
  commentId: string & tags.Format<"uuid">;
}): Promise<void> {
  const { registeredMember, commentId } = props;

  // Authorization: ensure the caller is an active registered member and user not soft-deleted
  const member =
    await MyGlobal.prisma.community_platform_registeredmembers.findFirst({
      where: {
        community_platform_user_id: registeredMember.id,
        deleted_at: null,
        user: { deleted_at: null },
      },
      select: { id: true },
    });
  if (member === null) {
    throw new HttpException("Forbidden: Registered member is not active", 403);
  }

  // Resource existence/access check: comment must exist and its parent post must be accessible (not deleted)
  const comment = await MyGlobal.prisma.community_platform_comments.findFirst({
    where: {
      id: commentId,
      deleted_at: null,
      post: { deleted_at: null },
    },
    select: { id: true },
  });
  if (comment === null) {
    throw new HttpException(
      "Not Found: Comment does not exist or is inaccessible",
      404,
    );
  }

  // Idempotent removal of the caller's vote: hard delete to allow future re-vote (unique constraint on user/comment)
  await MyGlobal.prisma.community_platform_comment_votes.deleteMany({
    where: {
      community_platform_comment_id: commentId,
      community_platform_user_id: registeredMember.id,
    },
  });

  // No content on success
  return;
}
