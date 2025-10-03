import { tags } from "typia";

export namespace ICommunityPlatformSiteAdminJoin {
  /**
   * Request body to register a new Site Administrator.
   *
   * Creates a user row in Actors.community_platform_users (email, username,
   * password_hash from password, optional display_name) and grants admin
   * privileges via Actors.community_platform_siteadmins. Case-insensitive
   * uniqueness is enforced through normalized columns email_normalized and
   * username_normalized, computed by the application per Prisma schema
   * guidance.
   */
  export type ICreate = {
    /**
     * Administrator’s email address (human-readable). A normalized form
     * (email_normalized) is derived application-side to satisfy
     * case-insensitive uniqueness in Actors.community_platform_users.
     *
     * Prisma columns: community_platform_users.email,
     * community_platform_users.email_normalized (derived).
     */
    email: string & tags.Format<"email">;

    /**
     * Administrator’s username/handle (human-readable). A normalized form
     * (username_normalized) is derived application-side for
     * case-insensitive uniqueness in Actors.community_platform_users.
     *
     * Prisma columns: community_platform_users.username,
     * community_platform_users.username_normalized (derived).
     */
    username: string &
      tags.MinLength<3> &
      tags.MaxLength<30> &
      tags.Pattern<"^[A-Za-z0-9](?:[A-Za-z0-9_-]{1,28}[A-Za-z0-9])?$">;

    /**
     * Plaintext password supplied by the client for account creation. The
     * backend MUST hash it into community_platform_users.password_hash;
     * plaintext is never stored.
     *
     * Prisma column: community_platform_users.password_hash
     * (server-computed).
     */
    password: string & tags.MinLength<8> & tags.MaxLength<128>;

    /**
     * Optional public-facing display name for the admin account. When null
     * or empty the UI may show a fallback.
     *
     * Prisma column: community_platform_users.display_name (nullable).
     */
    displayName?:
      | (string & tags.MinLength<0> & tags.MaxLength<64>)
      | null
      | undefined;
  };
}
