import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ICommunityPlatformComment } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformComment";
import { IECommunityPlatformVoteState } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformVoteState";
import { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";
import { RegisteredmemberPayload } from "../decorators/payload/RegisteredmemberPayload";

export async function postCommunityPlatformRegisteredMemberPostsPostIdComments(props: {
  registeredMember: RegisteredmemberPayload;
  postId: string & tags.Format<"uuid">;
  body: ICommunityPlatformComment.ICreate;
}): Promise<ICommunityPlatformComment> {
  const { registeredMember, postId, body } = props;

  /**
   * Create a new threaded comment under a post.
   *
   * Validations:
   *
   * - Authenticated registered member required
   * - Content length 2..2000
   * - Post must exist and not be soft-deleted
   * - If parentId provided: parent must exist on the same post, not deleted, and
   *   depth of new comment ≤ 8
   * - Author must not be under active write restriction
   *
   * Returns the created comment with identifiers and timestamps.
   *
   * @param props - Request properties
   * @param props.registeredMember - Authenticated registered member payload
   * @param props.postId - Target post UUID
   * @param props.body - Comment creation payload
   * @returns Created comment resource
   * @throws {HttpException} 401 when unauthenticated
   * @throws {HttpException} 403 when restricted or not a member
   * @throws {HttpException} 404 when post/parent not found
   * @throws {HttpException} 400 on validation failures
   */

  // Authentication guard
  if (!registeredMember || !registeredMember.id) {
    throw new HttpException("Please sign in to continue.", 401);
  }

  // Basic content validation (2..2000 chars)
  if (
    typeof body.content !== "string" ||
    body.content.length < 2 ||
    body.content.length > 2000
  ) {
    throw new HttpException(
      "Bad Request: content must be 2-2000 characters.",
      400,
    );
  }

  // Ensure author (user) exists and is not soft-deleted
  const user = await MyGlobal.prisma.community_platform_users.findFirst({
    where: { id: registeredMember.id, deleted_at: null },
  });
  if (!user) {
    throw new HttpException("Forbidden: User not found or deactivated.", 403);
  }

  // Ensure active registered membership
  const membership =
    await MyGlobal.prisma.community_platform_registeredmembers.findFirst({
      where: {
        community_platform_user_id: registeredMember.id,
        deleted_at: null,
        user: { deleted_at: null },
      },
    });
  if (!membership) {
    throw new HttpException(
      "Forbidden: You are not an active registered member.",
      403,
    );
  }

  // Restriction guard (read_only/suspended). Active if not revoked and (no expiry or expiry in future)
  const now: string & tags.Format<"date-time"> = toISOStringSafe(new Date());
  const activeRestriction =
    await MyGlobal.prisma.community_platform_guestvisitors.findFirst({
      where: {
        community_platform_user_id: registeredMember.id,
        deleted_at: null,
        revoked_at: null,
        OR: [{ restricted_until: null }, { restricted_until: { gt: now } }],
      },
    });
  if (activeRestriction) {
    throw new HttpException(
      "Forbidden: Your account is restricted from writing.",
      403,
    );
  }

  // Validate post existence (not soft-deleted)
  const post = await MyGlobal.prisma.community_platform_posts.findFirst({
    where: { id: postId, deleted_at: null },
  });
  if (!post) {
    throw new HttpException("Not Found: Post does not exist.", 404);
  }

  // Parent validations and depth enforcement (max depth = 8 including root)
  let parentId: (string & tags.Format<"uuid">) | null = body.parentId ?? null;
  if (parentId !== null && parentId !== undefined) {
    const parent = await MyGlobal.prisma.community_platform_comments.findFirst({
      where: {
        id: parentId,
        community_platform_post_id: postId,
        deleted_at: null,
      },
      select: { id: true, parent_id: true, community_platform_post_id: true },
    });
    if (!parent) {
      throw new HttpException(
        "Not Found: Parent comment not found in this post.",
        404,
      );
    }

    // Compute parent depth; ensure new depth ≤ 8
    let depth = 1; // parent at least depth 1
    let currentParentId: string | null = parent.parent_id;
    while (currentParentId) {
      const ancestor =
        await MyGlobal.prisma.community_platform_comments.findUnique({
          where: { id: currentParentId },
          select: {
            id: true,
            parent_id: true,
            community_platform_post_id: true,
          },
        });
      if (!ancestor || ancestor.community_platform_post_id !== postId) {
        throw new HttpException("Bad Request: Invalid parent chain.", 400);
      }
      depth += 1;
      if (depth >= 8) {
        // Parent depth already at 8 → new child would exceed max depth
        throw new HttpException(
          "Bad Request: Maximum nesting depth (8) exceeded.",
          400,
        );
      }
      currentParentId = ancestor.parent_id;
    }
  } else {
    parentId = null;
  }

  // Create the comment
  const created = await MyGlobal.prisma.community_platform_comments.create({
    data: {
      id: v4() as string & tags.Format<"uuid">,
      community_platform_post_id: postId,
      community_platform_user_id: registeredMember.id,
      parent_id: parentId,
      content: body.content,
      created_at: now,
      updated_at: now,
    },
  });

  // Map to API DTO
  return {
    id: created.id as string & tags.Format<"uuid">,
    postId: created.community_platform_post_id as string & tags.Format<"uuid">,
    authorId: created.community_platform_user_id as string &
      tags.Format<"uuid">,
    parentId:
      created.parent_id === null
        ? null
        : (created.parent_id as string & tags.Format<"uuid">),
    content: created.content,
    createdAt: created.created_at ? toISOStringSafe(created.created_at) : now,
    updatedAt: created.updated_at ? toISOStringSafe(created.updated_at) : now,
    deletedAt: created.deleted_at ? toISOStringSafe(created.deleted_at) : null,
  };
}
