import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { RegisteredmemberPayload } from "../decorators/payload/RegisteredmemberPayload";

export async function deleteCommunityPlatformRegisteredMemberCommentsCommentId(props: {
  registeredMember: RegisteredmemberPayload;
  commentId: string & tags.Format<"uuid">;
}): Promise<void> {
  // Authorization: ensure authenticated payload exists
  if (!props || !props.registeredMember || !props.registeredMember.id) {
    throw new HttpException("Unauthorized", 401);
  }

  // 1) Load the target comment
  const comment = await MyGlobal.prisma.community_platform_comments.findUnique({
    where: { id: props.commentId },
    select: {
      id: true,
      community_platform_user_id: true,
      deleted_at: true,
    },
  });

  if (comment === null) {
    throw new HttpException("Not Found", 404);
  }

  // 2) Prevent duplicate deletions
  if (comment.deleted_at !== null) {
    throw new HttpException("Already deleted", 409);
  }

  // 3) Ownership check (author only)
  if (comment.community_platform_user_id !== props.registeredMember.id) {
    throw new HttpException(
      "You can edit or delete only items you authored.",
      403,
    );
  }

  // 4) Soft delete by setting deleted_at
  await MyGlobal.prisma.community_platform_comments.update({
    where: { id: props.commentId },
    data: {
      deleted_at: toISOStringSafe(new Date()),
      // Do not touch any other relations or fields
    },
  });

  // Return void (204 No Content at controller layer)
  return;
}
