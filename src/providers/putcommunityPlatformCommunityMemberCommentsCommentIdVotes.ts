import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ICommunityPlatformCommentVote } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommentVote";
import { CommunitymemberPayload } from "../decorators/payload/CommunitymemberPayload";

export async function putcommunityPlatformCommunityMemberCommentsCommentIdVotes(props: {
  communityMember: CommunitymemberPayload;
  commentId: string & tags.Format<"uuid">;
  body: ICommunityPlatformCommentVote.IUpdate;
}): Promise<ICommunityPlatformCommentVote> {
  /**
   * Update a communityMember’s vote on a specific comment.
   *
   * Sets or changes the authenticated member's vote state ("Upvote" |
   * "Downvote") for the target comment. Ensures a single active record per
   * (comment, user) and enforces business rules: comment must exist and not be
   * deleted, and authors cannot vote on their own comments. Idempotent on
   * same-state updates.
   *
   * @param props - Operation properties
   * @param props.communityMember - Authenticated community member payload
   *   (actor user id)
   * @param props.commentId - Target comment UUID
   * @param props.body - Desired vote state payload
   * @returns The current vote record for this (comment, user)
   * @throws {HttpException} 404 when comment not found or deleted
   * @throws {HttpException} 403 when attempting to vote on own comment
   * @throws {HttpException} 400 when state is invalid
   */
  const { communityMember, commentId, body } = props;

  // Validate target comment exists and is active (not soft-deleted)
  const comment = await MyGlobal.prisma.community_platform_comments.findUnique({
    where: { id: commentId },
    select: {
      id: true,
      community_platform_user_id: true,
      deleted_at: true,
    },
  });
  if (!comment || comment.deleted_at !== null) {
    throw new HttpException("Not Found", 404);
  }

  // Business rule: users cannot vote on their own comments
  if (comment.community_platform_user_id === communityMember.id) {
    throw new HttpException(
      "Forbidden: You can't vote on your own comment",
      403,
    );
  }

  // Validate state (defensive; DTO already constrains but keep explicit)
  const desired = body.state;
  if (desired !== "Upvote" && desired !== "Downvote") {
    throw new HttpException("Bad Request: Invalid vote state", 400);
  }

  // Fetch existing vote for (comment, user)
  const existing =
    await MyGlobal.prisma.community_platform_comment_votes.findFirst({
      where: {
        community_platform_comment_id: commentId,
        community_platform_user_id: communityMember.id,
      },
    });

  // Current timestamp
  const now = toISOStringSafe(new Date());

  // If no existing record: create new active vote
  if (!existing) {
    const created =
      await MyGlobal.prisma.community_platform_comment_votes.create({
        data: {
          id: v4() as string & tags.Format<"uuid">,
          community_platform_comment_id: commentId,
          community_platform_user_id: communityMember.id,
          state: desired,
          created_at: now,
          updated_at: now,
          deleted_at: null,
        },
      });

    return {
      id: created.id as string & tags.Format<"uuid">,
      community_platform_comment_id:
        created.community_platform_comment_id as string & tags.Format<"uuid">,
      community_platform_user_id: created.community_platform_user_id as string &
        tags.Format<"uuid">,
      state: created.state as ICommunityPlatformCommentVote["state"],
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };
  }

  // If record exists but is soft-deleted: reactivate and set desired state
  if (existing.deleted_at !== null) {
    const updated =
      await MyGlobal.prisma.community_platform_comment_votes.update({
        where: { id: existing.id },
        data: {
          state: desired,
          updated_at: now,
          deleted_at: null,
        },
      });

    return {
      id: updated.id as string & tags.Format<"uuid">,
      community_platform_comment_id:
        updated.community_platform_comment_id as string & tags.Format<"uuid">,
      community_platform_user_id: updated.community_platform_user_id as string &
        tags.Format<"uuid">,
      state: updated.state as ICommunityPlatformCommentVote["state"],
      created_at: toISOStringSafe(updated.created_at),
      updated_at: now,
      deleted_at: null,
    };
  }

  // Active record exists
  if (existing.state === desired) {
    // Idempotent: return current representation without additional changes
    return {
      id: existing.id as string & tags.Format<"uuid">,
      community_platform_comment_id:
        existing.community_platform_comment_id as string & tags.Format<"uuid">,
      community_platform_user_id:
        existing.community_platform_user_id as string & tags.Format<"uuid">,
      state: existing.state as ICommunityPlatformCommentVote["state"],
      created_at: toISOStringSafe(existing.created_at),
      updated_at: toISOStringSafe(existing.updated_at),
      deleted_at: null,
    };
  }

  // Toggle or change state on active record
  const changed = await MyGlobal.prisma.community_platform_comment_votes.update(
    {
      where: { id: existing.id },
      data: {
        state: desired,
        updated_at: now,
      },
    },
  );

  return {
    id: changed.id as string & tags.Format<"uuid">,
    community_platform_comment_id:
      changed.community_platform_comment_id as string & tags.Format<"uuid">,
    community_platform_user_id: changed.community_platform_user_id as string &
      tags.Format<"uuid">,
    state: changed.state as ICommunityPlatformCommentVote["state"],
    created_at: toISOStringSafe(changed.created_at),
    updated_at: now,
    deleted_at: changed.deleted_at ? toISOStringSafe(changed.deleted_at) : null,
  };
}
