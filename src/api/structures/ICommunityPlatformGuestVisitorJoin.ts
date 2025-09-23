import { tags } from "typia";

export namespace ICommunityPlatformGuestVisitorJoin {
  /**
   * Guest registration/correlation payload.
   *
   * Creates or updates Actors: community_platform_guestvisitors
   * (first_seen_at / last_seen_at). Security: no credentials; no actor IDs
   * are accepted from clients.
   */
  export type ICreate = {
    /**
     * Opaque fingerprint used to correlate guest sessions.
     *
     * Prisma: community_platform_guestvisitors.device_fingerprint
     * (optional).
     */
    device_fingerprint?: (string & tags.MaxLength<512>) | undefined;

    /**
     * Client user-agent to record in guest context.
     *
     * Prisma: community_platform_guestvisitors.user_agent (optional).
     */
    user_agent?: (string & tags.MaxLength<1000>) | null | undefined;

    /**
     * Client IP to record in guest context.
     *
     * Prisma: community_platform_guestvisitors.ip (optional).
     */
    ip?: (string & tags.MaxLength<255>) | null | undefined;
  };
}
