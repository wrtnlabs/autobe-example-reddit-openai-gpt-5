import { tags } from "typia";

import { IAuthorizationToken } from "./IAuthorizationToken";
import { ICommunityPlatformUser } from "./ICommunityPlatformUser";

export namespace ICommunityPlatformCommunityMember {
  /**
   * Community member registration payload.
   *
   * This request creates a new identity in community_platform_users and binds
   * credentials in community_platform_user_credentials, then assigns the
   * communityMember role (community_platform_communitymembers) and issues a
   * session (community_platform_sessions). For security, do not accept actor
   * IDs (e.g., user_id) or system fields; server derives ownership from
   * authentication context and generates identifiers and timestamps.
   */
  export type ICreate = {
    /**
     * Unique public handle for the new account.
     *
     * Maps to Prisma community_platform_users.username (unique). This value
     * identifies the user and must be globally unique per
     * @@unique(username).
     */
    username: string;

    /**
     * Login email address for credential binding.
     *
     * Maps to Prisma community_platform_user_credentials.email
     * (email_normalized is derived by the server for case-insensitive
     * uniqueness).
     */
    email: string & tags.Format<"email">;

    /**
     * Plaintext password provided by the client for secure hashing.
     *
     * Server hashes into community_platform_user_credentials.password_hash
     * and never stores plaintext. Minimum length enforced at the
     * application layer.
     */
    password: string & tags.MinLength<8>;
  };

  /**
   * Authorization response for community members containing the issued token
   * bundle and the subject identifier.
   *
   * This DTO is returned after join, login, or refresh flows for the member
   * role. It references Prisma models: community_platform_users (id, status),
   * community_platform_user_credentials (credentials are never exposed), and
   * community_platform_sessions (backing refresh lifecycle).
   */
  export type IAuthorized = {
    /**
     * Unique identifier of the authenticated community member.
     *
     * Maps to community_platform_users.id and is the subject of issued
     * tokens.
     */
    id: string & tags.Format<"uuid">;

    /** JWT token information for authentication */
    token: IAuthorizationToken;

    /**
     * Optional hydrated user object for immediate client consumption.
     *
     * Includes public-safe identity fields (username, status, timestamps)
     * sourced from community_platform_users.
     */
    user?: ICommunityPlatformUser | undefined;
  };

  /**
   * Union login request for community members.
   *
   * Supports either email+password or username+password authentication
   * strategies. Underlying verification is performed against
   * community_platform_user_credentials and community_platform_users as
   * described in the Prisma schema comments.
   */
  export type ILogin =
    | ICommunityPlatformCommunityMember.ILogin.IByEmail
    | ICommunityPlatformCommunityMember.ILogin.IByUsername;
  export namespace ILogin {
    /**
     * Login payload using email + password.
     *
     * Backed by Prisma community_platform_user_credentials
     * (email/email_normalized, password_hash).
     */
    export type IByEmail = {
      /**
       * Login email corresponding to
       * community_platform_user_credentials.email (case-insensitive
       * lookups use email_normalized in persistence logic).
       */
      email: string & tags.Format<"email">;

      /**
       * Plaintext password provided by the user for verification against
       * community_platform_user_credentials.password_hash.
       *
       * SECURITY: This value is accepted in the request only and is never
       * persisted in plaintext.
       */
      password: string & tags.MinLength<8>;
    };

    /**
     * Login payload using username + password.
     *
     * Username maps to Prisma community_platform_users.username (unique).
     */
    export type IByUsername = {
      /**
       * Alternative login identifier mapped to
       * community_platform_users.username (unique).
       */
      username: string;

      /**
       * Plaintext password provided by the user for verification against
       * community_platform_user_credentials.password_hash.
       *
       * SECURITY: This value is accepted in the request only and is never
       * persisted in plaintext.
       */
      password: string & tags.MinLength<8>;
    };
  }

  /**
   * Refresh-token exchange request for community members.
   *
   * Supplies only the raw refresh token. No actor IDs or system-generated
   * fields are accepted. On success, the server returns
   * ICommunityPlatformCommunityMember.IAuthorized with new access/refresh
   * tokens.
   */
  export type IRefresh = {
    /**
     * Raw refresh token issued previously.
     *
     * Server validates by hashing and comparing to
     * community_platform_sessions.refresh_token_hash, ensuring revoked_at
     * is null and expires_at is valid.
     */
    refresh_token: string;
  };

  /**
   * Password change request for community members.
   *
   * This request rotates credentials stored in
   * community_platform_user_credentials by verifying current_password and
   * updating to new_password. No actor IDs or system fields are permitted in
   * the body; ownership is derived from the authenticated context.
   */
  export type IUpdate = {
    /**
     * The caller’s current password used to verify identity before
     * rotation.
     *
     * Verified against community_platform_user_credentials.password_hash.
     */
    current_password: string & tags.MinLength<8>;

    /**
     * The desired new password to be stored as a hash.
     *
     * Server replaces community_platform_user_credentials.password_hash and
     * sets password_updated_at accordingly.
     */
    new_password: string & tags.MinLength<8>;
  };
}
