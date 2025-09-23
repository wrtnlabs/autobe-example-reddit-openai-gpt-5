import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe"
import { HttpException } from "@nestjs/common";
import { ICommunityPlatformPostVote } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformPostVote";
import { CommunitymemberPayload } from "../decorators/payload/CommunitymemberPayload"

/**
 * Upsert the current user’s vote (community_platform_post_votes) to "up" or
 * "down" for a post
 *
 * Create or update the authenticated community member's vote for the specified
 * post. Enforces: post must exist and not be soft-deleted; users cannot vote on
 * their own posts. The vote is stored as a single record per (post, user) with
 * state "up" or "down". To clear a vote (None), clients should use DELETE
 * /communityPlatform/communityMember/posts/{postId}/votes.
 *
 * @param props - Request properties
 * @param props.communityMember - The authenticated community member payload
 * @param props.postId - UUID of the post to vote on
 * @param props.body - Desired vote state ("up" | "down")
 * @returns The saved vote record for this (post, user)
 * @throws {HttpException} 400 - When state is not exactly "up" or "down"
 * @throws {HttpException} 403 - When attempting to vote on own post
 * @throws {HttpException} 404 - When the target post does not exist or is
 *   deleted
 */
export async function putcommunityPlatformCommunityMemberPostsPostIdVotes(props: {
  communityMember: CommunitymemberPayload;
  postId: string & tags.Format<"uuid">;
  body: ICommunityPlatformPostVote.IUpdate;
}): Promise<ICommunityPlatformPostVote> {
  const { communityMember, postId, body } = props;

  // Validate state strictly
  if (body.state !== "up" && body.state !== "down") {
    throw new HttpException(
      'Bad Request: 'state' must be "up" or "down"',
      400,
    );
  }

  // Ensure target post exists and is not soft-deleted
  const post = await MyGlobal.prisma.community_platform_posts.findFirst({
    where: {
      id: postId,
      deleted_at: null,
    },
  });
  if (!post) throw new HttpException("Not Found", 404);

  // Self-vote prevention
  if (
    post.author_user_id !== null &&
    post.author_user_id === communityMember.id
  ) {
    throw new HttpException("You can’t vote on your own posts/comments.", 403);
  }

  const now = toISOStringSafe(new Date());

  // Find existing vote for (post, user)
  const existing =
    await MyGlobal.prisma.community_platform_post_votes.findFirst({
      where: {
        community_platform_post_id: postId,
        community_platform_user_id: communityMember.id,
      },
    });

  if (existing) {
    // Update existing vote (idempotent if same state), ensure active
    const updated = await MyGlobal.prisma.community_platform_post_votes.update({
      where: { id: existing.id },
      data: {
        state: body.state,
        updated_at: now,
        deleted_at: null,
      },
    });

    return {
      id: updated.id as string & tags.Format<"uuid">,
      community_platform_post_id: updated.community_platform_post_id as string &
        tags.Format<"uuid">,
      community_platform_user_id: updated.community_platform_user_id as string &
        tags.Format<"uuid">,
      state: updated.state as ICommunityPlatformPostVote.IState,
      created_at: toISOStringSafe(updated.created_at),
      updated_at: now,
    };
  }

  // Create a new vote
  const created = await MyGlobal.prisma.community_platform_post_votes.create({
    data: {
      id: v4() as string & tags.Format<"uuid">,
      community_platform_post_id: postId,
      community_platform_user_id: communityMember.id,
      state: body.state,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    },
  });

  return {
    id: created.id as string & tags.Format<"uuid">,
    community_platform_post_id: created.community_platform_post_id as string &
      tags.Format<"uuid">,
    community_platform_user_id: created.community_platform_user_id as string &
      tags.Format<"uuid">,
    state: created.state as ICommunityPlatformPostVote.IState,
    created_at: now,
    updated_at: now,
  };
}
