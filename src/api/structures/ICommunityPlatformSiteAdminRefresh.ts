import { tags } from "typia";

export namespace ICommunityPlatformSiteAdminRefresh {
  /**
   * Admin session refresh request payload.
   *
   * This DTO renews a SiteAdmin session represented by
   * Sessions.community_platform_sessions. It carries sufficient token context
   * (e.g., sessionId or a refreshToken provided via body/cookie/header) so
   * the service can validate that the session has not been revoked
   * (revoked_at is null) and has not exceeded absolute lifetime (expires_at).
   * On success, the server updates last_seen_at and typically extends
   * expires_at.
   *
   * Prisma references: community_platform_sessions (id, hashed_token,
   * user_agent, ip, client_platform, client_device, last_seen_at, expires_at,
   * revoked_at).
   */
  export type IRequest = {
    /**
     * Identifier of the existing session to refresh.
     *
     * Maps to community_platform_sessions.id (UUID). When provided, the
     * server can directly locate the session row to validate
     * revocation/expiry status before rotating or extending it.
     */
    sessionId?: (string & tags.Format<"uuid">) | undefined;

    /**
     * Client-presented token material used to identify and validate the
     * session for renewal when body-based refresh is allowed.
     *
     * Prisma note: the database stores only
     * community_platform_sessions.hashed_token; this field carries
     * plaintext token material from the client for hashing/comparison. If
     * the platform relies solely on cookies/headers, this property may be
     * omitted by clients.
     */
    refreshToken?: string | undefined;

    /**
     * Optional client user agent string to update metadata on the session.
     *
     * Prisma mapping: community_platform_sessions.user_agent (nullable
     * text).
     */
    userAgent?: string | undefined;

    /**
     * Optional client IP address for session metadata (textual IPv4/IPv6
     * representation).
     *
     * Prisma mapping: community_platform_sessions.ip (nullable text).
     */
    ip?: string | undefined;

    /**
     * Optional client platform hint (e.g., OS/Browser summary) for
     * usability/security review.
     *
     * Prisma mapping: community_platform_sessions.client_platform (nullable
     * text).
     */
    clientPlatform?: string | undefined;

    /**
     * Optional device descriptor captured during session
     * establishment/refresh.
     *
     * Prisma mapping: community_platform_sessions.client_device (nullable
     * text).
     */
    clientDevice?: string | undefined;
  };
}
