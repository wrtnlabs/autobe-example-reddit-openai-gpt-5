import { tags } from "typia";

export namespace ICommunityPlatformSiteAdminPassword {
  /**
   * Admin password change request.
   *
   * This DTO updates community_platform_users.password_hash after verifying
   * the current password. It does not alter role-assignment rows
   * (community_platform_siteadmins) and may optionally revoke other sessions
   * via community_platform_sessions.revoked_at for security hygiene.
   *
   * Prisma references: community_platform_users (password_hash, updated_at),
   * community_platform_sessions (revoked_at).
   */
  export type IUpdate = {
    /**
     * Current credential to be verified against
     * community_platform_users.password_hash.
     *
     * Security: plaintext is received only to verify; backend must hash and
     * compare securely. Never persist plaintext.
     */
    currentPassword: string & tags.MinLength<1>;

    /**
     * New credential to replace the existing password.
     *
     * On success, write a fresh hash to
     * community_platform_users.password_hash and update updated_at. Policy
     * may require additional strength checks at the application layer.
     */
    newPassword: string & tags.MinLength<1>;

    /**
     * Whether to revoke all other active sessions after password rotation
     * (recommended security hygiene).
     *
     * If true, set community_platform_sessions.revoked_at for other
     * sessions linked to the same user. The current session may be rotated
     * or preserved per policy.
     */
    revokeOtherSessions?: boolean | undefined;
  };
}
