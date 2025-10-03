import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ICommunityPlatformCommentVote } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommentVote";
import { ICommentVoteUpdateState } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommentVoteUpdateState";
import { ICommunityPlatformCommentVoteOutcome } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommentVoteOutcome";
import { IVoteState } from "@ORGANIZATION/PROJECT-api/lib/structures/IVoteState";
import { RegisteredmemberPayload } from "../decorators/payload/RegisteredmemberPayload";

export async function putCommunityPlatformRegisteredMemberCommentsCommentIdVote(props: {
  registeredMember: RegisteredmemberPayload;
  commentId: string & tags.Format<"uuid">;
  body: ICommunityPlatformCommentVote.IUpdate;
}): Promise<ICommunityPlatformCommentVoteOutcome> {
  /**
   * Apply an Upvote or Downvote on a comment for the authenticated registered
   * member.
   *
   * Business rules:
   *
   * - Comment must exist and not be soft-deleted; its parent post must also be
   *   available (not soft-deleted).
   * - Authors cannot vote on their own comments.
   * - PUT sets or toggles a vote to UPVOTE (1) or DOWNVOTE (-1). Clearing is
   *   handled by DELETE endpoint.
   *
   * @param props - Request properties
   * @param props.registeredMember - Authenticated registered member payload
   * @param props.commentId - Target comment UUID
   * @param props.body - Desired vote state (UPVOTE or DOWNVOTE)
   * @returns Updated outcome including commentId, aggregated score, and
   *   caller's vote state
   * @throws {HttpException} 404 when comment/post not found or unavailable
   * @throws {HttpException} 400 when attempting to vote on own comment
   * @throws {HttpException} 500 on unexpected errors
   */
  try {
    const { registeredMember, commentId, body } = props;

    // 1) Verify target comment exists and is available; ensure parent post is available
    const comment =
      await MyGlobal.prisma.community_platform_comments.findUnique({
        where: { id: commentId },
        select: {
          id: true,
          community_platform_user_id: true,
          deleted_at: true,
          post: { select: { id: true, deleted_at: true } },
        },
      });

    if (
      !comment ||
      comment.deleted_at !== null ||
      !comment.post ||
      comment.post.deleted_at !== null
    ) {
      throw new HttpException("Comment not found or unavailable.", 404);
    }

    // 2) Self-vote prevention
    if (comment.community_platform_user_id === registeredMember.id) {
      throw new HttpException(
        "You can’t vote on your own posts/comments.",
        400,
      );
    }

    // 3) Apply vote (create or update)
    const now = toISOStringSafe(new Date());
    const value = body.state === "UPVOTE" ? 1 : -1;

    const existing =
      await MyGlobal.prisma.community_platform_comment_votes.findFirst({
        where: {
          community_platform_comment_id: commentId,
          community_platform_user_id: registeredMember.id,
        },
        select: { id: true },
      });

    if (existing) {
      await MyGlobal.prisma.community_platform_comment_votes.update({
        where: { id: existing.id },
        data: {
          value,
          updated_at: now,
          deleted_at: null,
        },
      });
    } else {
      await MyGlobal.prisma.community_platform_comment_votes.create({
        data: {
          id: v4(),
          community_platform_comment_id: commentId,
          community_platform_user_id: registeredMember.id,
          value,
          created_at: now,
          updated_at: now,
        },
      });
    }

    // 4) Compute updated score (upvotes - downvotes), considering only non-deleted votes
    const agg =
      await MyGlobal.prisma.community_platform_comment_votes.aggregate({
        where: {
          community_platform_comment_id: commentId,
          deleted_at: null,
        },
        _sum: { value: true },
      });

    const score = Number(agg._sum.value ?? 0);

    // 5) Return outcome
    return {
      commentId,
      score,
      myVote: body.state === "UPVOTE" ? "UPVOTE" : "DOWNVOTE",
    };
  } catch (err) {
    if (err instanceof HttpException) throw err;
    throw new HttpException(
      "A temporary error occurred. Please try again in a moment.",
      500,
    );
  }
}
