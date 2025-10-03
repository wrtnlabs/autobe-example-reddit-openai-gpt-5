import { IEVoteDirection } from "./IEVoteDirection";

export namespace ICommunityPlatformPostVote {
  /**
   * Post vote update payload.
   *
   * This DTO drives writes to the Prisma model Posts/Votes:
   * community_platform_post_votes by setting the caller’s effective vote for
   * a post. Only two directions are accepted here (UPVOTE or DOWNVOTE).
   * Transition to NONE is handled by the dedicated DELETE endpoint that
   * removes the vote row.
   */
  export type IUpdate = {
    /**
     * Desired vote direction for this post. Only UPVOTE or DOWNVOTE are
     * accepted here; use the DELETE endpoint to clear (None).
     */
    state: IEVoteDirection;
  };
}
