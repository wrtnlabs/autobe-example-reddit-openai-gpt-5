import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { RegisteredmemberPayload } from "../decorators/payload/RegisteredmemberPayload";

export async function deleteCommunityPlatformRegisteredMemberPostsPostIdVote(props: {
  registeredMember: RegisteredmemberPayload;
  postId: string & tags.Format<"uuid">;
}): Promise<void> {
  /**
   * Remove the caller’s vote (set to None) on a post.
   *
   * Deletes the row from community_platform_post_votes matching
   * (community_platform_post_id = postId, community_platform_user_id = caller),
   * making the effective vote state None. Operation is idempotent.
   *
   * Authorization: Registered member only (payload provided by decorator).
   *
   * @param props - Input properties
   * @param props.registeredMember - Authenticated registered member payload
   * @param props.postId - UUID of the target post
   * @returns Void on success
   * @throws {HttpException} 401 when unauthenticated
   * @throws {HttpException} 404 when the post does not exist or is inaccessible
   */
  const { registeredMember, postId } = props;

  // Authorization guard (defensive; decorator already ensures this)
  if (!registeredMember || registeredMember.type !== "registeredmember") {
    throw new HttpException("Please sign in to continue.", 401);
  }

  // Ensure the post exists and is accessible (not soft-deleted), and that
  // related entities (author/community) are not soft-deleted.
  const post = await MyGlobal.prisma.community_platform_posts.findFirst({
    where: {
      id: postId,
      deleted_at: null,
      author: { deleted_at: null },
      community: { deleted_at: null },
    },
    select: { id: true },
  });
  if (post === null) {
    throw new HttpException("Post not found or inaccessible.", 404);
  }

  // Idempotent removal of the caller's vote row.
  await MyGlobal.prisma.community_platform_post_votes.deleteMany({
    where: {
      community_platform_post_id: postId,
      community_platform_user_id: registeredMember.id,
    },
  });

  // No content on success (void)
}
