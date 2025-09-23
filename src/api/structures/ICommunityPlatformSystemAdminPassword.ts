import { tags } from "typia";

export namespace ICommunityPlatformSystemAdminPassword {
  /**
   * Password change request for a system administrator.\n\nApplication
   * behavior verifies `current_password` against Prisma
   * `community_platform_user_credentials.password_hash`. On success, it
   * updates `password_hash` and sets `password_updated_at`. Providers may
   * optionally revoke other sessions by updating
   * `community_platform_sessions.revoked_at` for rows other than the current
   * session, and optionally issue new tokens.\n\nSecurity requirements: This
   * request must never accept user or actor identifiers (e.g., user_id).
   * Credentials are sourced from the authenticated context. No plaintext
   * passwords are stored; only secure hashes are persisted in the
   * `community_platform_user_credentials` table.
   */
  export type IUpdate = {
    /**
     * Current password for the authenticated admin. Plain text input for
     * verification; never stored in this form. Business policies typically
     * require a minimum length (e.g., 8).
     */
    current_password: string & tags.MinLength<8> & tags.MaxLength<128>;

    /**
     * New password to set for the authenticated admin. Plain text input
     * used to compute a secure hash stored in
     * `community_platform_user_credentials.password_hash`. Typical minimum
     * length is 8 characters.
     */
    new_password: string & tags.MinLength<8> & tags.MaxLength<128>;

    /**
     * Optional flag instructing the provider to revoke other active
     * sessions (set `revoked_at` on other rows in
     * `community_platform_sessions`) after password rotation.
     */
    revoke_other_sessions?: boolean | undefined;

    /**
     * Optional flag requesting immediate issuance of new access/refresh
     * tokens for the current session after password change.
     */
    issue_new_tokens?: boolean | undefined;
  };
}
