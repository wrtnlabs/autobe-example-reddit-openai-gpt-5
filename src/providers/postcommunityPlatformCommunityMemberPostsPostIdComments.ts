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
 * Create a new comment under a specific post.
 *
 * Inserts a comment into community_platform_comments for the given postId.
 * Requires authenticated communityMember. Optionally accepts parent_id to
 * create a reply, which must reference an existing comment within the same
 * post.
 *
 * Authorization: caller must be an active community member with an active user
 * account. Validation: content length 2–2000; parent must belong to the same
 * post when provided.
 *
 * @param props - Request properties
 * @param props.communityMember - Authenticated community member payload (actor
 *   user id)
 * @param props.postId - Target post’s UUID where the comment will be created
 * @param props.body - Comment creation payload (content and optional parent_id)
 * @returns The newly created comment entity
 * @throws {HttpException} 400 When validation fails (content length, invalid
 *   parent, post not found)
 * @throws {HttpException} 403 When the caller is not an active community member
 */
export async function postcommunityPlatformCommunityMemberPostsPostIdComments(props: {
  communityMember: CommunitymemberPayload;
  postId: string & tags.Format<"uuid">;
  body: ICommunityPlatformComment.ICreate;
}): Promise<ICommunityPlatformComment> {
  const { communityMember, postId, body } = props;

  // Authorization: ensure active community member and active user
  const member =
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
    });
  if (!member) {
    throw new HttpException(
      "Forbidden: Inactive or missing community membership",
      403,
    );
  }

  // Basic validation for content length (2–2000)
  const content = body.content;
  if (
    typeof content !== "string" ||
    content.length < 2 ||
    content.length > 2000
  ) {
    throw new HttpException(
      "Bad Request: content must be 2–2000 characters",
      400,
    );
  }

  // Verify target post exists and is not soft-deleted
  const post = await MyGlobal.prisma.community_platform_posts.findFirst({
    where: { id: postId, deleted_at: null },
    select: { id: true },
  });
  if (!post) {
    throw new HttpException("Bad Request: post not found or deleted", 400);
  }

  // Validate parent comment if provided: must exist, not deleted, and belong to same post
  let parentId: (string & tags.Format<"uuid">) | null = null;
  if (body.parent_id !== undefined && body.parent_id !== null) {
    const parent = await MyGlobal.prisma.community_platform_comments.findFirst({
      where: {
        id: body.parent_id,
        deleted_at: null,
      },
      select: {
        id: true,
        community_platform_post_id: true,
      },
    });

    if (!parent) {
      throw new HttpException(
        "Bad Request: parent_id does not reference an existing comment",
        400,
      );
    }
    if (parent.community_platform_post_id !== postId) {
      throw new HttpException(
        "Bad Request: parent_id must reference a comment within the same post",
        400,
      );
    }
    parentId = parent.id as string & tags.Format<"uuid">;
  }

  // Prepare timestamps
  const now = toISOStringSafe(new Date());

  // Create the comment
  const created = await MyGlobal.prisma.community_platform_comments.create({
    data: {
      id: v4() as string & tags.Format<"uuid">,
      community_platform_post_id: postId,
      community_platform_user_id: communityMember.id,
      parent_id: parentId ?? null,
      content: content,
      created_at: now,
      updated_at: now,
    },
    select: {
      id: true,
      community_platform_post_id: true,
      community_platform_user_id: true,
      parent_id: true,
    },
  });

  // Build response using prepared timestamps to ensure proper typing
  return {
    id: created.id as string & tags.Format<"uuid">,
    community_platform_post_id: created.community_platform_post_id as string &
      tags.Format<"uuid">,
    community_platform_user_id: created.community_platform_user_id as string &
      tags.Format<"uuid">,
    parent_id:
      created.parent_id === null
        ? null
        : (created.parent_id as string & tags.Format<"uuid">),
    content,
    created_at: now,
    updated_at: now,
  };
}
