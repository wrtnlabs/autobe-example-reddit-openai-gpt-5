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

export async function putCommunityPlatformRegisteredMemberPostsPostIdCommentsCommentId(props: {
  registeredMember: RegisteredmemberPayload;
  postId: string & tags.Format<"uuid">;
  commentId: string & tags.Format<"uuid">;
  body: ICommunityPlatformComment.IUpdate;
}): Promise<ICommunityPlatformComment> {
  const { registeredMember, postId, commentId, body } = props;

  // Basic input expectation: content must be provided for this endpoint
  if (body.content === undefined) {
    throw new HttpException("Bad Request: content is required", 400);
  }

  // 1) Load target comment scoped by post and ensure not soft-deleted
  const existing = await MyGlobal.prisma.community_platform_comments.findFirst({
    where: {
      id: commentId,
      community_platform_post_id: postId,
      deleted_at: null,
      post: { deleted_at: null },
    },
    select: {
      id: true,
      community_platform_post_id: true,
      community_platform_user_id: true,
      parent_id: true,
      content: true,
      created_at: true,
      updated_at: true,
      deleted_at: true,
    },
  });
  if (!existing) {
    throw new HttpException("Not Found", 404);
  }

  // 2) Authorization: author or active site-admin can edit
  const isAuthor = existing.community_platform_user_id === registeredMember.id;
  let isSiteAdmin = false;
  if (!isAuthor) {
    const admin = await MyGlobal.prisma.community_platform_siteadmins.findFirst(
      {
        where: {
          community_platform_user_id: registeredMember.id,
          revoked_at: null,
          deleted_at: null,
          user: { deleted_at: null },
        },
        select: { id: true },
      },
    );
    isSiteAdmin = admin !== null;
  }
  if (!isAuthor && !isSiteAdmin) {
    throw new HttpException(
      "You can edit or delete only items you authored.",
      403,
    );
  }

  // 3) Perform update (content and updated_at only)
  const now: string & tags.Format<"date-time"> = toISOStringSafe(new Date());
  const updated = await MyGlobal.prisma.community_platform_comments.update({
    where: { id: existing.id },
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
      updated_at: true,
      deleted_at: true,
    },
  });

  // 4) Build response DTO
  const result: ICommunityPlatformComment = {
    id: typia.assert<string & tags.Format<"uuid">>(updated.id),
    postId: typia.assert<string & tags.Format<"uuid">>(
      updated.community_platform_post_id,
    ),
    authorId: typia.assert<string & tags.Format<"uuid">>(
      updated.community_platform_user_id,
    ),
    parentId:
      updated.parent_id === null
        ? null
        : typia.assert<string & tags.Format<"uuid">>(updated.parent_id),
    content: updated.content,
    createdAt: toISOStringSafe(updated.created_at),
    updatedAt: toISOStringSafe(updated.updated_at),
    deletedAt: updated.deleted_at ? toISOStringSafe(updated.deleted_at) : null,
  };

  return result;
}
