import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { RegisteredmemberPayload } from "../decorators/payload/RegisteredmemberPayload";

/**
 * Delete a post in community_platform_posts by marking deleted_at and removing
 * it from public views.
 *
 * Only the post’s author can delete. If the post does not exist or is already
 * deleted, returns 404. Sets deleted_at (and updated_at) to the current time to
 * soft-delete the post.
 *
 * @param props - Request properties
 * @param props.registeredMember - The authenticated registered member
 *   performing the deletion
 * @param props.postId - Target post identifier (UUID) to delete
 * @returns Void on success
 * @throws {HttpException} 401 When unauthenticated or invalid payload
 * @throws {HttpException} 403 When the requester is not the author
 * @throws {HttpException} 404 When the post is not found or already deleted
 */
export async function deleteCommunityPlatformRegisteredMemberPostsPostId(props: {
  registeredMember: RegisteredmemberPayload;
  postId: string & tags.Format<"uuid">;
}): Promise<void> {
  const { registeredMember, postId } = props;

  // Authentication check
  if (!registeredMember || registeredMember.type !== "registeredmember") {
    throw new HttpException("Login required", 401);
  }

  // Fetch target post (must be not deleted)
  const post = await MyGlobal.prisma.community_platform_posts.findFirst({
    where: {
      id: postId,
      deleted_at: null,
    },
    select: {
      id: true,
      community_platform_user_id: true,
    },
  });

  if (post === null) {
    throw new HttpException("Not Found", 404);
  }

  // Ownership enforcement
  if (post.community_platform_user_id !== registeredMember.id) {
    throw new HttpException(
      "You can edit or delete only items you authored.",
      403,
    );
  }

  // Soft-delete: set deleted_at and update updated_at
  await MyGlobal.prisma.community_platform_posts.update({
    where: { id: postId },
    data: {
      deleted_at: toISOStringSafe(new Date()),
      updated_at: toISOStringSafe(new Date()),
    },
  });

  // void return (204 No Content semantics handled by controller layer)
  return;
}
