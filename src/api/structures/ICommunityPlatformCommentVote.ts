import { ICommentVoteUpdateState } from "./ICommentVoteUpdateState";

export namespace ICommunityPlatformCommentVote {
  /**
   * Request body for applying a vote to a comment (PUT
   * /communityPlatform/registeredMember/comments/{commentId}/vote).
   *
   * Backed by Prisma model Comments.community_platform_comment_votes
   * (columns: id, community_platform_comment_id, community_platform_user_id,
   * value, created_at, updated_at, deleted_at). The request expresses only
   * the intended state; ownership and self‑vote guards are enforced by
   * service logic.
   */
  export type IUpdate = {
    /**
     * Desired vote to apply to the target comment.
     *
     * Maps to Prisma Comments.community_platform_comment_votes.value (1 for
     * UPVOTE, −1 for DOWNVOTE). NONE is handled by the DELETE vote endpoint
     * and is not accepted here.
     */
    state: ICommentVoteUpdateState;
  };
}
