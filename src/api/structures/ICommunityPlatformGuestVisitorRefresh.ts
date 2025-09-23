export namespace ICommunityPlatformGuestVisitorRefresh {
  /**
   * Guest token rotation request.
   *
   * This payload carries the refresh token and optional client context hints.
   * The underlying guest identity is in community_platform_guestvisitors; no
   * community_platform_sessions row exists for guests.
   */
  export type IRequest = {
    /**
     * Refresh token issued previously to the guest visitor. Required for
     * token rotation.
     *
     * Security: Treat as secret. The server validates and rotates this
     * value without persisting it in a sessions table.
     */
    refresh_token: string;

    /**
     * Optional current user-agent to support anomaly detection or audit
     * trails.
     */
    user_agent?: string | null | undefined;

    /**
     * Optional current IP address to support anomaly detection or audit
     * trails.
     */
    ip?: string | null | undefined;
  };
}
