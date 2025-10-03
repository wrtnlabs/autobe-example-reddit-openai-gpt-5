import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ICommunityPlatformPostVote } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformPostVote";
import { IEVoteDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IEVoteDirection";
import { ICommunityPlatformPostVoteOutcome } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformPostVoteOutcome";
import { IEVoteState } from "@ORGANIZATION/PROJECT-api/lib/structures/IEVoteState";
import { RegisteredmemberPayload } from "../decorators/payload/RegisteredmemberPayload";

export async function putCommunityPlatformRegisteredMemberPostsPostIdVote(props: {
  registeredMember: RegisteredmemberPayload;
  postId: string & tags.Format<"uuid">;
  body: ICommunityPlatformPostVote.IUpdate;
}): Promise<ICommunityPlatformPostVoteOutcome> {
  const { registeredMember, postId, body } = props;

  try {
    // 1) Verify target post exists and is visible (not soft-deleted)
    const post = await MyGlobal.prisma.community_platform_posts.findFirst({
      where: { id: postId, deleted_at: null },
      select: { id: true, community_platform_user_id: true },
    });
    if (!post) throw new HttpException("Post not found or not accessible", 404);

    // 2) Prevent self-vote
    if (post.community_platform_user_id === registeredMember.id) {
      throw new HttpException(
        "You can’t vote on your own posts/comments.",
        400,
      );
    }

    // 3) Map desired state to value {-1, 1}
    const desiredValue: 1 | -1 = body.state === "UPVOTE" ? 1 : -1;

    // 4) Upsert-like behavior without relying on composite upsert naming
    const existing =
      await MyGlobal.prisma.community_platform_post_votes.findFirst({
        where: {
          community_platform_post_id: postId,
          community_platform_user_id: registeredMember.id,
          deleted_at: null,
        },
        select: { id: true, value: true },
      });

    const now: string & tags.Format<"date-time"> = toISOStringSafe(new Date());

    if (!existing) {
      // Create new vote
      await MyGlobal.prisma.community_platform_post_votes.create({
        data: {
          id: v4(),
          community_platform_post_id: postId,
          community_platform_user_id: registeredMember.id,
          value: desiredValue,
          created_at: now,
          updated_at: now,
          deleted_at: null,
        },
      });
    } else if (existing.value !== desiredValue) {
      // Update existing vote value
      await MyGlobal.prisma.community_platform_post_votes.update({
        where: { id: existing.id },
        data: { value: desiredValue, updated_at: now },
      });
    } // else idempotent, no write

    // 5) Recompute score: sum of active votes
    const agg = await MyGlobal.prisma.community_platform_post_votes.aggregate({
      where: { community_platform_post_id: postId, deleted_at: null },
      _sum: { value: true },
    });
    const score = Number(agg._sum.value ?? 0);

    // 6) Build outcome
    const myVote: IEVoteState = body.state; // "UPVOTE" | "DOWNVOTE" fits IEVoteState

    return {
      postId,
      score,
      myVote,
    };
  } catch (err) {
    if (err instanceof HttpException) throw err;
    throw new HttpException(
      "A temporary error occurred. Please try again in a moment.",
      500,
    );
  }
}
