import { tags } from "typia";

export namespace ICommunityPlatformSiteAdminLogin {
  /**
   * Request body to authenticate a Site Administrator. On success a new
   * session row is created in Sessions.community_platform_sessions with
   * hashed token material and lifecycle fields.
   */
  export type ICreate = {
    /**
     * Email or username used for authentication lookup (case-insensitive).
     * The application resolves this against
     * community_platform_users.email_normalized or username_normalized per
     * Prisma schema comments.
     */
    identifier: string & tags.MinLength<1> & tags.MaxLength<320>;

    /**
     * Plaintext password for verification. The backend compares against
     * community_platform_users.password_hash; plaintext is never stored.
     */
    password: string & tags.MinLength<8> & tags.MaxLength<128>;
  };
}
